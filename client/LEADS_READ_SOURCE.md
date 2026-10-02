# Nguồn Leads của khách

Để chạy local, cấu hình trong `client/.env.local` rồi khởi động lại Vite:

```dotenv
VITE_LEADS_READ_URL=https://dhsywwqoi.datadex.vn/webhook/crm-mock-hdn
```

Frontend gọi GET trực tiếp endpoint HTTPS, không gửi JWT của CRM hay cookie sang n8n. Không cấu hình biến này thì ứng dụng dùng API CRM như trước.

Đăng nhập manager vẫn dùng API CRM: với `VITE_API_URL=http://localhost:3005/api`, cần chạy backend từ thư mục `server` bằng `pnpm dev`. CORS mặc định hỗ trợ cả `localhost:5173` và `127.0.0.1:5173`. Khi nghiệm thu local, đặt `BACKGROUND_JOBS_ENABLED=false` trong `server/.env` để không chạy cron SLA và gửi CUTI outbox; đây không phải cấu hình production.

Danh sách đọc `data: [...]`; chi tiết đọc `lead: {...}` nếu đúng `lead_id`, nếu không thì tìm ID trong danh sách. Hiện cả hai cùng được trả bởi một endpoint; không tự thêm `/leads/:id` hay query chưa được khách cung cấp. Tìm kiếm và phân trang xử lý trên danh sách trả về; endpoint cần trả đủ danh sách để tổng số chính xác.

| Trường JSON | Hiển thị |
| --- | --- |
| `lead_id` | ID thẻ và đường dẫn chi tiết |
| `customer.display_name`, `customer.phone`, `customer.avatar_url` | Thông tin khách; phone null: Chưa có SĐT |
| `kanban_column` | Map vào 6 cột CRM cũ; xem bảng dưới |
| `next_action.display_text` | Badge thẻ và Hẹn chăm sóc / Việc cần làm |
| `customer_insight`, `ai_suggested_reply` | AI Insight và Gợi ý trả lời trên chi tiết |
| `owner` | Nhân viên phụ trách; null: Chưa gán Sale |
| `last_message.text`, `last_message.sent_at` | Tin nhắn gần nhất |

Không dùng `pipeline_stage`, `summary.next_action`, hoặc thời gian SLA để suy ra cột/lịch hẹn. Không hiển thị Hẹn lịch họp. Nguồn này chỉ có hợp đồng đọc nên ẩn/chặn tạo, sửa, xóa và kéo thả cập nhật lead.

Giữ nguyên tên, màu và thứ tự 6 cột của frontend. Mã API chỉ quyết định thẻ nằm ở đâu:

| Mã API | Cột CRM |
| --- | --- |
| `NEED_DISCOVERY` | Xác định nhu cầu |
| `PRICE_NEGOTIATION` | Đàm phán giá |
| `APPOINTMENT_SHOP`, `APPOINTMENT_SHIP` | Hẹn qua hoặc ship |
| `WON` | Chốt đơn |

Hẹn gửi ảnh và Fail (khách rời) vẫn hiển thị; hợp đồng JSON hiện chưa có mã cho hai cột này, nên không tự suy ra dữ liệu vào đó. Bộ lọc Tất cả NV / Chưa phân công / tên Sale tiếp tục lấy danh sách Sale từ CRM khi đăng nhập, không giới hạn vào owner của một lead JSON. Chi tiết dùng bố cục CRM cũ và hiển thị next_action/AI trong các ô hiện có. Nút thao tác giữ ở vị trí cũ nhưng bị khóa với nguồn chỉ đọc.

Vite DEV cho xem riêng `/leads` và `/leads/:id` với nguồn công khai này, không cần đăng nhập để nghiệm thu local. Khi đã đăng nhập, người dùng xem trong layout CRM đầy đủ và kiểm tra quyền bình thường. Bản build production vẫn yêu cầu đăng nhập/quyền CRM. Chưa deploy; khi khách duyệt, cần cấu hình biến trên môi trường frontend và build lại để bật nguồn ngoài.
