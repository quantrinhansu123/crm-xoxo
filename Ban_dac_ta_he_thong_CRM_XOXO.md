BẢN ĐẶC TẢ CHÍNH THỨC
HỆ THỐNG PHÂN CHIA OWNER VÀ KIỂM SOÁT SLA LEADS CRM XOXO
Phiên bản FINAL – Dùng để Công triển khai
Múi giờ nghiệp vụ: Asia/Ho_Chi_Minh (UTC+07:00)
Nguyên tắc bắt buộc: mọi thời gian xử lý nội bộ bằng GIÂY; backend là nguồn sự thật duy nhất.
 I. Mục đích hệ thống
1.	Khách mới chưa có owner vẫn là khách chung của shop.
2.	Sale hợp lệ trả lời khách trước sẽ nhận quyền sở hữu lead.
3.	Không cho phép sale khác nhắn chen để cướp owner.
4.	Owner phải trả lời khách trong đúng 180 giây khi khách chủ động nhắn.
5.	Khi khách im lặng, owner phải chăm sóc theo đúng chuỗi milestone.
6.	Tin nhắn sale quá sớm không được reset hoặc hoàn thành milestone.
7.	Chỉ tin nhắn hợp lệ trong đúng cửa sổ thời gian mới được chuyển milestone.
8.	Một message, một SLA hoặc một milestone chỉ được xử lý đúng một lần.
9.	Backend CRM quyết định toàn bộ owner và SLA.
10.	n8n chỉ nhận event để gửi thông báo, không quyết định nghiệp vụ.
II. Quy ước thời gian chung
1. Đơn vị xử lý nội bộ
•	Toàn bộ thời lượng trong backend phải được tính bằng giây.
•	Frontend có thể hiển thị phút, giờ hoặc ngày nhưng không được tự tính deadline.
•	Backend lưu thời điểm bằng timestamp có độ chính xác tối thiểu đến mili giây.
•	Khuyến nghị lưu timestamp theo UTC trong database.
•	Khi áp dụng giờ nghỉ hoặc hiển thị cho người dùng, chuyển đổi theo múi giờ Asia/Ho_Chi_Minh.
2. Nguồn thời gian sự kiện
Thứ tự ưu tiên:
•	Ưu tiên 1: source_event_time do Pancake hoặc nền tảng nhắn tin cung cấp.
•	Ưu tiên 2: backend_received_at nếu source_event_time không có hoặc không hợp lệ.
Không dùng thời gian frontend hiển thị, thời gian n8n xử lý, thời gian Telegram gửi cảnh báo, thời gian cron bắt đầu chạy hoặc thời gian nhân viên mở CRM để xác định SLA.
3. Điều kiện hiệu lực của deadline
Hành động đúng hạn:
event_time < deadline_at

SLA hết hạn:
current_time >= deadline_at
Ví dụ deadline = 09:03:00.000: 09:02:59.999 còn hợp lệ; đúng 09:03:00.000 là hết hạn.
4. Điều kiện cửa sổ hợp lệ
qualifying_from_at <= event_time < deadline_at
Cận bắt đầu được tính là hợp lệ; cận deadline không được tính là hợp lệ.
5. Countdown frontend
remaining_seconds = deadline_at - server_current_time
Frontend không được tự tính bằng last_message_at + duration, không tự cộng milestone và không tự thay đổi deadline.
III. Các trạng thái chính
State	Ý nghĩa
UNASSIGNED_IDLE	Lead chưa có owner và hiện không có SLA 180 giây đang chạy.
UNASSIGNED_WAITING_SALE	Lead chưa có owner; khách vừa nhắn; chờ sale hợp lệ phản hồi trong 180 giây.
OWNED_WAITING_CUSTOMER	Lead đã có owner; sale đã trả lời; khách đang im lặng; chạy chuỗi follow-up.
OWNED_WAITING_SALE	Lead đã có owner; khách vừa nhắn lại; owner phải phản hồi trong 180 giây.
PAUSED_FOLLOWUP	Milestone follow-up dài đang tạm dừng trong giờ nghỉ.
STOPPED_WON	Lead đã chốt đơn; dừng toàn bộ SLA.
STOPPED_FAILED	Lead đã kết thúc chăm sóc hoặc hoàn thành mốc cuối; dừng toàn bộ SLA.

IV. Loại tin nhắn và nhân viên hợp lệ
1. Tin nhắn khách hợp lệ
Được tính: text, ảnh, video, voice, file, sticker nếu nền tảng tạo message_id thật và các nội dung inbound khác có message_id thật.
Không tính: seen, reaction, typing, sự kiện hệ thống, thay đổi tag và ghi chú nội bộ.
2. Tin nhắn sale hợp lệ
•	Có message_id thật.
•	Đã được nền tảng xác nhận gửi tới khách.
•	Người gửi được map đúng tài khoản nhân viên trong CRM.
•	Người gửi đang hoạt động.
•	Không phải bot, auto-reply, tin hệ thống hoặc ghi chú nội bộ.
•	Đúng sale được phép xử lý trong state hiện tại.
Nội dung hợp lệ có thể là text, ảnh, video, voice, file hoặc tin nhắn thật khác được gửi tới khách.
3. Bot và auto-reply
Bot hoặc auto-reply không được nhận owner, hoàn thành SLA 180 giây, reset deadline, hoàn thành/chuyển milestone hoặc ngăn reclaim.
V. Khách mới nhắn lần đầu
assigned_to = null
sla_state = UNASSIGNED_WAITING_SALE
last_customer_message_at = T1
sla_started_at = T1
warning_at = T1 + 90 giây
deadline_at = T1 + 180 giây
SLA chính xác là 180 giây. Cảnh báo bắt đầu sau 90 giây. Sale được nhận lead trong toàn bộ khoảng T1 <= sale_event_time < T1 + 180 giây.
Nếu hết deadline mà chưa có sale trả lời: assigned_to vẫn null; lead vẫn là khách chung; state chuyển UNASSIGNED_IDLE; không reclaim và không tự gán sale.
VI. Khách chưa có owner gửi nhiều tin liên tiếp
Mỗi lead chỉ được tồn tại tối đa 01 SLA loại CUSTOMER_RESPONSE_180S đang active.
Tin đầu tiên tại T1:
sla_started_at = T1
warning_at = T1 + 90 giây
deadline_at = T1 + 180 giây

Tin mới tại T2 trước khi có sale trả lời hợp lệ:
last_customer_message_at = T2
sla_started_at = T2
warning_at = T2 + 90 giây
deadline_at = T2 + 180 giây
trigger_message_id = message_id của tin T2
Deadline cũ bị thay thế hoàn toàn; không cộng dồn 180 giây; không tạo timer thứ hai; không giữ nhiều deadline song song.
Sự kiện	Warning	Deadline
Khách nhắn 09:00:00	09:01:30	09:03:00
Khách nhắn tiếp 09:01:15	09:02:45	09:04:15
Khách nhắn tiếp 09:03:50	09:05:20	09:06:50

Sale trả lời 09:06:49.999 là hợp lệ; 09:06:50.000 là quá hạn.
VII. Sale đầu tiên nhận khách chung
Điều kiện:
assigned_to IS NULL
AND sale_message_event_time < deadline_at
Backend phải dùng transaction hoặc compare-and-set. Chỉ request cập nhật thành công đầu tiên được nhận lead.
Sau khi nhận lead:
assigned_to = sale_id
assigned_at = sale_message_event_time
sla_state = OWNED_WAITING_CUSTOMER
current_milestone_index = 0
current_duration_seconds = 3600
current_cycle_started_at = sale_message_event_time
qualifying_from_at = sale_message_event_time + 1800 giây
warning_at = sale_message_event_time + 1800 giây
deadline_at = sale_message_event_time + 3600 giây
Lead chuyển thẳng sang milestone 60 phút; không chạy lại mốc 3 phút.
VIII. Hai sale trả lời gần như đồng thời
Không định nghĩa bằng khoảng giây. Mọi request xử lý bằng transaction. Chỉ một request được đổi assigned_to từ null sang sale_id.
Request commit thành công đầu tiên nhận owner và bắt đầu milestone 3600 giây. Request sau không được ghi đè owner, không reset SLA, không tạo OWNER_ASSIGNED lần hai và được xử lý như sale nhắn chen.
IX. Chuỗi follow-up khi khách im lặng
Index	Tên mốc	duration_seconds	warning_offset_seconds	qualifying_offset_seconds
0	60 phút	3600	1800	1800
1	180 phút	10800	1800	1800
2	300 phút	18000	1800	1800
3	420 phút	25200	1800	1800
4	1.440 phút	86400	1800	1800
5	2.880 phút	172800	1800	1800
6	3.120 phút	187200	1800	1800
7	4.020 phút	241200	1800	1800
8	5.160 phút	309600	1800	1800
9	6.600 phút	396000	1800	1800

X. Công thức tính milestone
current_cycle_started_at = thời điểm milestone bắt đầu
deadline_at = current_cycle_started_at + duration_seconds
warning_at = deadline_at - 1800 giây
qualifying_from_at = deadline_at - 1800 giây

Tin hợp lệ:
qualifying_from_at <= owner_message_event_time < deadline_at

Tin quá sớm:
owner_message_event_time < qualifying_from_at

Tin quá hạn:
owner_message_event_time >= deadline_at
XI. Cách cộng dồn milestone
Khi owner hoàn thành milestone đúng hạn, milestone tiếp theo bắt đầu từ deadline của milestone vừa hoàn thành, không bắt đầu từ thời điểm owner gửi tin.
next_cycle_started_at = current_deadline_at
next_deadline_at = current_deadline_at + next_duration_seconds
next_warning_at = next_deadline_at - 1800 giây
next_qualifying_from_at = next_deadline_at - 1800 giây
Mốc	Bắt đầu	Qualifying from	Deadline	Tin owner
60 phút	09:00:00	09:30:00	10:00:00	09:45:00
180 phút tiếp theo	10:00:00	12:30:00	13:00:00	—

Không được tính 09:45:00 + 180 phút = 12:45:00. Deadline đúng là 13:00:00.
XII. Tin nhắn owner trong milestone follow-up
1. Trước cửa sổ 1.800 giây cuối
Chỉ lưu tin; không reset cycle, warning, qualifying_from hoặc deadline; không hoàn thành milestone; không tăng index.
2. Trong cửa sổ 1.800 giây cuối
Tin đầu tiên của đúng owner được gắn qualifying_message_id, hoàn thành milestone, tăng index đúng 1 và tạo milestone kế tiếp.
3. Tại hoặc sau deadline
Không được hoàn thành milestone cũ. Backend phải kiểm tra trạng thái reclaim bằng transaction.
XIII. Owner gửi nhiều tin liên tiếp
Một milestone chỉ có tối đa 01 qualifying_message_id. Không dùng khoảng 5 giây hoặc 1 phút để nhận biết tin liên tiếp.
Khi message đầu tiên hoàn thành milestone:
qualifying_message_id = message_id đầu tiên
milestone_status = COMPLETED
version = version + 1
Các message sau chỉ lưu tin, không hoàn thành lại, không tăng index và không thay đổi deadline milestone mới.
XIV. Khách đã có owner nhắn lại
Khi lead ở OWNED_WAITING_CUSTOMER và khách nhắn tại T1:
sla_state = OWNED_WAITING_SALE
last_customer_message_at = T1
sla_started_at = T1
warning_at = T1 + 90 giây
deadline_at = T1 + 180 giây
Milestone follow-up cũ dừng ngay. Thông tin cũ chỉ giữ để audit, không tiếp tục chạy.
XV. Khách có owner gửi nhiều tin liên tiếp
Mỗi inbound mới tại T2:
last_customer_message_at = T2
sla_started_at = T2
warning_at = T2 + 90 giây
deadline_at = T2 + 180 giây
trigger_message_id = message_id mới nhất
Chỉ giữ đúng 01 SLA CUSTOMER_RESPONSE_180S active.
Sự kiện	Warning	Deadline
Khách nhắn 14:00:00	14:01:30	14:03:00
Khách nhắn tiếp 14:02:00	14:03:30	14:05:00
Khách nhắn tiếp 14:04:50	14:06:20	14:07:50

XVI. Owner trả lời khách trong 180 giây
sale_id = assigned_to
AND owner_message_event_time < deadline_at
AND sla_state = OWNED_WAITING_SALE
Khi đúng owner trả lời: giữ owner, hoàn thành SLA 180 giây, gắn qualifying_message_id, chuyển OWNED_WAITING_CUSTOMER và bắt đầu lại từ mốc 60 phút.
current_milestone_index = 0
current_cycle_started_at = owner_message_event_time
warning_at = owner_message_event_time + 1800 giây
qualifying_from_at = owner_message_event_time + 1800 giây
deadline_at = owner_message_event_time + 3600 giây
XVII. Owner không trả lời trong 180 giây
server_current_time >= deadline_at
AND qualifying_message_id IS NULL
•	Gỡ owner; assigned_to = null; assigned_at = null.
•	sla_state = UNASSIGNED_IDLE.
•	Dừng SLA; ghi SLA_RECLAIM và lịch sử thu hồi.
•	Lead trở lại kho chung; không tự động giao sale khác.
•	Nếu khách nhắn sau đó, mở SLA 180 giây mới.
XVIII. Sale khác nhắn khi lead đang có owner
assigned_to != null
AND sender_sale_id != assigned_to
•	Lưu message nếu nền tảng đã gửi thành công.
•	Không đổi owner hoặc assigned_at.
•	Không hoàn thành SLA 180 giây.
•	Không reset deadline.
•	Không hoàn thành hoặc chuyển milestone.
•	Không ngăn reclaim của owner.
•	Ghi INTRUSION_DETECTED.
XIX. Lead đã bị reclaim và sale cũ trả lời
Sau reclaim, assigned_to = null. Sale cũ không còn ưu tiên; sale cũ và sale khác bình đẳng. Ai trả lời hợp lệ trước trong SLA active sẽ nhận owner. Không sửa ngược lịch sử reclaim.
XX. Hết deadline follow-up không có tin hợp lệ
server_current_time >= deadline_at
AND qualifying_message_id IS NULL
Nếu chưa phải mốc cuối: gỡ owner, dừng milestone, state UNASSIGNED_IDLE, ghi SLA_RECLAIM, đưa lead về kho chung, không tự giao sale khác và không tự bắt đầu lại mốc 60 phút.
XXI. Xử lý mốc cuối 6.600 phút
Mốc cuối có duration_seconds = 396.000 giây; cửa sổ hợp lệ là 1.800 giây cuối.
1. Owner không follow hợp lệ
Gỡ owner, đưa lead về kho chung, ghi SLA_RECLAIM. Không đánh dấu fail tự động vì owner đã bỏ mốc.
2. Owner follow hợp lệ
Hoàn thành mốc cuối, không tạo mốc tiếp theo, không lặp 6.600 phút, dừng toàn bộ SLA, chuyển STOPPED_FAILED, không còn countdown/warning/reclaim.
XXII. Khách nhắn đúng lúc deadline
Nếu customer_event_time < current_followup_deadline_at:
- Không reclaim theo milestone cũ.
- Chuyển OWNED_WAITING_SALE.
- deadline mới = customer_event_time + 180 giây.

Nếu customer_event_time >= current_followup_deadline_at
và reclaim đã commit:
- Không khôi phục owner cũ.
- Lead thuộc kho chung.
- Mở SLA 180 giây mới.
Nếu event đến backend muộn nhưng source_event_time trước deadline, backend vẫn phải dùng event_time và transaction để tránh reclaim sai.
XXIII. Owner trả lời đúng lúc job reclaim chạy
Bắt buộc dùng row lock, transaction, version check hoặc optimistic locking.
Nếu owner_message_event_time < deadline_at và message hợp lệ commit trước reclaim thì giữ owner. Nếu reclaim đã commit trước và deadline đã hết thì không tự khôi phục owner. Không quyết định bằng thứ tự cron log.
XXIV. Giờ nghỉ
Thông số	Giá trị chính xác
Bắt đầu	00:00:00
Kết thúc	06:30:00
Múi giờ	Asia/Ho_Chi_Minh
Tổng thời gian	23.400 giây = 390 phút = 6 giờ 30 phút

1. Milestone follow-up dài
Pause khi:
00:00:00 <= local_time < 06:30:00

Tại 00:00:00:
remaining_seconds = deadline_at - pause_started_at
sla_paused_at = pause_started_at
sla_remaining_seconds = remaining_seconds
sla_state = PAUSED_FOLLOWUP

Tại 06:30:00:
deadline_at = resume_at + sla_remaining_seconds
warning_at = deadline_at - 1800 giây
qualifying_from_at = deadline_at - 1800 giây
sla_state = OWNED_WAITING_CUSTOMER
Không cộng trọn 23.400 giây nếu milestone bắt đầu giữa giờ nghỉ; phải lưu đúng số giây còn lại.
2. Khách chủ động nhắn trong giờ nghỉ
Dù milestone đang pause, inbound khách vẫn mở SLA 180 giây ngay, warning = T + 90 giây, deadline = T + 180 giây. SLA 180 giây không pause.
Nếu owner trả lời đúng hạn, bắt đầu mốc 60 phút từ thời điểm owner trả lời; mốc mới tiếp tục tuân thủ pause giờ nghỉ. Nếu owner không trả lời thì reclaim khi current_time >= deadline.
3. Khách mới nhắn trong giờ nghỉ
Khách mới vẫn mở SLA 180 giây ngay; sale trả lời trước deadline nhận lead; không pause SLA khách mới.
XXV. Chốt đơn
sla_state = STOPPED_WON
sla_stopped_at = thời điểm xác nhận chốt
current_deadline_at = null
warning_at = null
qualifying_from_at = null
current_milestone_index = null
active_sla_id = null
Dừng SLA 180 giây, follow-up, countdown, warning, reclaim và intrusion SLA tự động.
Owner vẫn giữ để chăm sóc, theo dõi đơn, chăm sóc sau bán và được tính hoa hồng. Khách nhắn lại sau khi chốt không mở lại SLA bán hàng, không tạo lead mới, không đưa về kho chung và không bắt đầu lại mốc 60 phút.
XXVI. Lead fail
Khi chuyển STOPPED_FAILED: xóa deadline/warning/qualifying, dừng countdown, warning, reclaim, milestone; không tự mở lại. Mốc cuối 6.600 phút được follow hợp lệ sẽ chuyển sang trạng thái này.
XXVII. Chống webhook trùng
Khóa idempotency khuyến nghị:
source + page_id + conversation_id + message_id
Database phải có unique constraint. Webhook trùng không được tạo message/SLA/owner/milestone/intrusion/event nghiệp vụ lần hai. Chống trùng phải nằm ở backend và database, không chỉ ở n8n.
XXVIII. Webhook đến sai thứ tự
Mỗi event phải lưu source_event_time, backend_received_at, processed_at, message_id, event_type và event_version nếu có.
Không loại toàn bộ event chỉ vì event_time <= last_processed_event_time, vì hai tin hợp lệ có thể cùng timestamp. Chống trùng bằng message_id.
Event cũ không được ghi đè owner mới, kéo state quay lại, reset deadline mới hoặc hoàn thành milestone đã đóng. Trước mọi thay đổi phải kiểm tra state, current_sla_id, current_milestone_id, version và message_id.
XXIX. Các field backend tối thiểu
Nhóm	Field bắt buộc
Lead	lead_id; conversation_id; page_id; source; assigned_to; assigned_at; sla_state; active_sla_id; sla_type; current_milestone_index; current_milestone_duration_seconds; current_cycle_started_at; warning_at; qualifying_from_at; current_deadline_at; last_customer_message_at; last_owner_message_at; trigger_message_id; qualifying_message_id; sla_paused_at; sla_remaining_seconds; sla_stopped_at; last_intrusion_at; version; created_at; updated_at
Message	message_id; source; page_id; conversation_id; lead_id; direction; sender_type; sender_sale_id; source_event_time; backend_received_at; processed_at; message_type; is_bot; is_auto_reply; is_internal; is_duplicate
Milestone history	milestone_id; lead_id; owner_id; milestone_index; duration_seconds; cycle_started_at; warning_at; qualifying_from_at; deadline_at; qualifying_message_id; completed_at; expired_at; status
Assignment history	lead_id; old_owner_id; new_owner_id; reason; event_time; message_id; created_at

XXX. Event backend gửi sang n8n
Event	Khi phát
OWNER_ASSIGNED	Khi sale nhận lead thành công.
SLA_WARNING	SLA 180 giây: deadline - 90 giây. Milestone: deadline - 1.800 giây. Mỗi SLA/mốc chỉ 1 lần.
SLA_RECLAIM	Sau khi backend reclaim thành công.
INTRUSION_DETECTED	Khi sale khác nhắn vào lead đang có owner.
SLA_PAUSED	Khi milestone pause lúc 00:00:00.
SLA_RESUMED	Khi milestone tiếp tục lúc 06:30:00.
SLA_STOPPED	Khi lead chuyển STOPPED_WON hoặc STOPPED_FAILED.

n8n chỉ gửi Telegram/thông báo, ghi log, tổng hợp KPI và cảnh báo quản lý.
XXXI. Phân quyền backend và n8n
Backend CRM là nguồn sự thật duy nhất cho owner, assignment, state, SLA, deadline, warning, qualifying window, milestone, reclaim, pause, resume, stop và intrusion.
n8n không được tự gán/gỡ owner, đổi assigned_to, reset deadline, tăng milestone, chuyển state, reclaim hoặc đánh dấu won/failed.
XXXII. Logic cron hoặc scheduler
Warning query:
warning_at <= server_current_time
AND warning_sent_at IS NULL

Deadline query:
deadline_at <= server_current_time
AND sla_status = ACTIVE
Trước warning/reclaim phải lock lead hoặc SLA, đọc state mới nhất, kiểm tra version, qualifying_message_id, SLA còn active và deadline chưa đổi. Nếu nhiều worker, chỉ một worker được xử lý một SLA.
XXXIII. Bảng chuyển state chính thức
State trước	Sự kiện	State sau	Hành động
UNASSIGNED_IDLE	Khách inbound	UNASSIGNED_WAITING_SALE	deadline = inbound_time + 180 giây
UNASSIGNED_WAITING_SALE	Khách inbound mới	UNASSIGNED_WAITING_SALE	deadline mới = inbound_time mới + 180 giây
UNASSIGNED_WAITING_SALE	Sale hợp lệ trả lời trước deadline	OWNED_WAITING_CUSTOMER	Gán owner; bắt đầu mốc 3.600 giây
UNASSIGNED_WAITING_SALE	Hết deadline	UNASSIGNED_IDLE	Vẫn không có owner
OWNED_WAITING_CUSTOMER	Khách inbound	OWNED_WAITING_SALE	deadline = inbound_time + 180 giây
OWNED_WAITING_SALE	Khách inbound mới	OWNED_WAITING_SALE	deadline mới = inbound_time mới + 180 giây
OWNED_WAITING_SALE	Đúng owner trả lời trước deadline	OWNED_WAITING_CUSTOMER	Bắt đầu lại mốc 3.600 giây
OWNED_WAITING_SALE	Hết deadline	UNASSIGNED_IDLE	Gỡ owner
OWNED_WAITING_CUSTOMER	Owner nhắn trước qualifying_from	Giữ nguyên	Không đổi timer
OWNED_WAITING_CUSTOMER	Owner nhắn trong cửa sổ hợp lệ	Giữ state	Hoàn thành đúng 1 milestone
OWNED_WAITING_CUSTOMER	Hết deadline không có tin hợp lệ	UNASSIGNED_IDLE	Gỡ owner
OWNED_WAITING_CUSTOMER	Sale khác nhắn	Giữ nguyên	Tạo INTRUSION_DETECTED
Bất kỳ state SLA	Chốt đơn	STOPPED_WON	Dừng toàn bộ SLA
Mốc cuối 396.000 giây	Owner follow hợp lệ	STOPPED_FAILED	Dừng toàn bộ SLA

XXXIV. Các ca kiểm thử bắt buộc
TEST 1 – Khách mới, sale trả lời đúng hạn
Khách nhắn 09:00:00; warning 09:01:30; deadline 09:03:00.
Sale A trả lời 09:02:00.
Kết quả: Owner = Sale A; mốc 60 phút bắt đầu 09:02:00; qualifying 09:32:00; deadline 10:02:00.
TEST 2 – Khách mới gửi nhiều tin
09:00:00 → deadline 09:03:00.
09:02:30 → deadline mới 09:05:30.
Sale trả lời 09:04:00 → nhận lead hợp lệ.
TEST 3 – Sale trả lời đúng deadline
Deadline 09:03:00.000; sale message 09:03:00.000.
Kết quả: không hợp lệ vì event_time >= deadline_at.
TEST 4 – Follow quá sớm
Mốc 60 phút bắt đầu 09:00:00; qualifying 09:30:00; deadline 10:00:00.
Owner nhắn 09:29:59 → chỉ lưu tin; deadline giữ 10:00:00.
TEST 5 – Follow đúng đầu cửa sổ
Owner nhắn 09:30:00 → hợp lệ; chuyển mốc 180 phút; deadline mới 13:00:00.
TEST 6 – Follow gần deadline
Owner nhắn 09:59:59.999 → hợp lệ.
TEST 7 – Follow đúng deadline
Owner nhắn 10:00:00.000 → không hợp lệ; milestone hết hạn.
TEST 8 – Khách nhắn lại ở mốc dài
Deadline mốc cũ 20:00:00; khách nhắn 18:00:00.
Dừng mốc cũ; owner phải trả lời trước 18:03:00.
Owner trả lời 18:02:00 → mốc 60 phút mới: qualifying 18:32:00; deadline 19:02:00.
TEST 9 – Khách gửi nhiều tin khi chờ owner
18:00:00 → deadline 18:03:00.
18:02:50 → deadline mới 18:05:50.
Owner trả lời 18:04:00 → hợp lệ.
TEST 10 – Sale khác nhắn chen
Owner Sale A; khách nhắn 10:00:00; deadline 10:03:00.
Sale B nhắn 10:01:00.
Kết quả: Owner vẫn A; deadline giữ 10:03:00; B không hoàn thành SLA; tạo intrusion. A không trả lời thì reclaim.
TEST 11 – Pause qua đêm
Deadline cũ 02:00:00; pause 00:00:00; remaining 7.200 giây.
Resume 06:30:00 → deadline mới 08:30:00; qualifying/warning 08:00:00.
TEST 12 – Khách nhắn trong giờ pause
Khách nhắn 02:00:00; warning 02:01:30; deadline 02:03:00.
Owner trả lời 02:02:00 → hợp lệ. Mốc 60 phút mới phải tuân thủ pause; còn đủ 3.600 giây chạy từ 06:30:00 nên deadline 07:30:00.
TEST 13 – Webhook trùng
Cùng message_id gửi 3 lần.
Kết quả: tạo 1 message; xử lý 1 lần; không reset deadline/chuyển milestone/phát event trùng.
TEST 14 – Chốt đơn
Lead đang ở mốc 180 phút; chốt lúc 15:00:00.
Kết quả: STOPPED_WON; xóa deadline; dừng warning/reclaim; sale giữ chăm sóc và hoa hồng.
Khách nhắn lại 17:00:00 → chuyển sale phụ trách; không mở SLA 180 giây; không quay lại mốc 60 phút.
XXXV. Nguyên tắc tuyệt đối không được vi phạm
11.	Không dùng mọi tin nhắn sale để reset deadline.
12.	Không tính milestone tiếp theo từ thời điểm sale follow sớm hoặc follow trong cửa sổ.
13.	Milestone tiếp theo phải cộng từ deadline milestone trước.
14.	Khách inbound mới luôn đặt lại SLA phản hồi thành inbound_event_time + 180 giây.
15.	Mỗi lead chỉ có tối đa 01 SLA phản hồi khách active.
16.	Mỗi milestone chỉ có tối đa 01 qualifying_message_id.
17.	Sale khác không được thay đổi owner hoặc SLA.
18.	Đúng deadline là đã hết hạn.
19.	Backend là nguồn sự thật duy nhất.
20.	Frontend chỉ hiển thị.
21.	n8n chỉ thông báo.
22.	Tất cả deadline phải tính bằng timestamp và số giây chính xác.
23.	Mọi thao tác gán owner, chuyển milestone và reclaim phải được bảo vệ bằng transaction và version check.
24.	Không để webhook trùng gây xử lý nghiệp vụ nhiều lần.
25.	Không tự suy diễn các cụm từ như gần hết hạn, tin liên tiếp, gần đồng thời hoặc trả lời nhanh; phải áp dụng đúng các con số và điều kiện trong tài liệu.
LƯU Ý TRIỂN KHAI QUAN TRỌNG
Khi owner trả lời khách trong giờ nghỉ, milestone 60 phút vừa tạo phải lập tức tuân thủ cơ chế pause. Ví dụ owner trả lời lúc 02:02:00, hệ thống không được để deadline chạy tới 03:02:00. Phải lưu đủ 3.600 giây còn lại và tiếp tục từ 06:30:00, vì vậy deadline thực tế là 07:30:00.
