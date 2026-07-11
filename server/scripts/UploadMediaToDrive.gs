/**
 * Apps Script — bản khớp CRM hiện tại (nhận URL → lưu Drive + share public link)
 *
 * BẮT BUỘC: Deploy → Manage deployments → Edit → New version → Deploy
 * Sau đó GET phải hiện: usage có chữ "base64" hoặc "share"
 */

var FOLDER_ID = '1fttSVyJzYO4BtZf2QeOJhkhXbXjdJM8k';

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    var root = DriveApp.getFolderById(FOLDER_ID);
    var target = body.folder ? getOrCreateSubFolder_(root, String(body.folder)) : root;

    var saved;
    if (body.base64) {
      saved = saveBase64ToDrive_(body, target);
    } else if (body.url) {
      var url = String(body.url || '').trim();
      if (!/^https?:\/\//i.test(url)) {
        return json_({ ok: false, error: 'Missing or invalid url' });
      }
      saved = saveUrlToDrive_(url, target, body.fileName || '');
    } else {
      return json_({ ok: false, error: 'Provide url or base64' });
    }

    return json_({
      ok: true,
      id: saved.id,
      name: saved.name,
      link: saved.link,
      playUrl: saved.playUrl
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return json_({
    ok: true,
    service: 'CRM Media → Google Drive',
    folderId: FOLDER_ID,
    usage: 'POST JSON { url } hoặc { base64, mimeType, fileName } | share=anyone'
  });
}

function saveUrlToDrive_(url, folder, preferredName) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('HTTP ' + res.getResponseCode());
  }
  var blob = res.getBlob();
  var contentType = blob.getContentType() || 'application/octet-stream';
  var fileName = preferredName && String(preferredName).trim()
    ? String(preferredName).trim()
    : ('media_' + Date.now() + guessExt_(url, contentType));
  blob.setName(fileName);
  blob.setContentType(contentType);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return fileResult_(file);
}

function saveBase64ToDrive_(body, folder) {
  var raw = String(body.base64 || '');
  var mimeType = String(body.mimeType || 'application/octet-stream');
  var b64 = raw;
  var m = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (m) { mimeType = m[1] || mimeType; b64 = m[2]; }
  var fileName = String(body.fileName || ('media_' + Date.now())).trim();
  if (!/\.[a-z0-9]+$/i.test(fileName)) fileName += guessExt_('', mimeType);
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return fileResult_(file);
}

function fileResult_(file) {
  return {
    id: file.getId(),
    name: file.getName(),
    link: file.getUrl(),
    playUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId()
  };
}

function getOrCreateSubFolder_(parent, name) {
  var safe = String(name || 'misc').replace(/[\\/]/g, '-').substring(0, 80);
  var it = parent.getFoldersByName(safe);
  return it.hasNext() ? it.next() : parent.createFolder(safe);
}

function guessExt_(url, contentType) {
  var m = String(url).split('?')[0].match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|m4v)$/i);
  if (m) return m[0].toLowerCase();
  if (String(contentType).indexOf('video/') === 0) return '.mp4';
  if (String(contentType).indexOf('image/png') === 0) return '.png';
  return '.jpg';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
