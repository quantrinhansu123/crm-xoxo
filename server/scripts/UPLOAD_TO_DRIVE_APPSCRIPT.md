# Upload ảnh/video trên UI → Google Drive

## Hành vi

| Loại | Supabase Storage | Google Drive |
|------|------------------|--------------|
| Ảnh  | **Không**        | **Có**       |
| Video| **Không**        | **Có**       |

Cả ảnh và video upload qua Apps Script (`base64`) → lưu Drive.

## Bắt buộc

1. Dán `UploadMediaToDrive.gs` (hỗ trợ base64)
2. Deploy → **New version**
3. `GOOGLE_DRIVE_APPSCRIPT_URL` trong `server/.env`
4. Restart server

## Giới hạn

- File ≤ ~30MB (Apps Script)
- Share “Anyone with link” để CRM xem được
