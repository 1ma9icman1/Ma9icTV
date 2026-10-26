package com.ma9ic.tv;

import fi.iki.elonen.NanoHTTPD;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;

/** Loopback-only HTTP bridge for media and text fetches inside the APK. */
public final class LocalApiServer extends NanoHTTPD {
    public LocalApiServer() { super("127.0.0.1", 8765); }

    @Override public Response serve(IHTTPSession session) {
        Map<String, String> params = session.getParms();
        String path = session.getUri();
        if (Method.OPTIONS.equals(session.getMethod())) {
            return cors(newFixedLengthResponse(Response.Status.OK, "text/plain", ""));
        }
        if ("/api/health".equals(path)) {
            return cors(newFixedLengthResponse(Response.Status.OK, "application/json",
                "{\"status\":\"ok\",\"name\":\"Ma9icTV embedded Android API\"}"));
        }
        if ("/api/xtream".equals(path) && Method.POST.equals(session.getMethod())) {
            try {
                java.util.Map<String, String> files = new java.util.HashMap<>();
                session.parseBody(files);
                String raw = files.get("postData");
                if (raw == null) raw = "";
                org.json.JSONObject body = new org.json.JSONObject(raw);
                String serverUrl = body.optString("serverUrl", "").replaceAll("/+$", "");
                String username = body.optString("username", "");
                String password = body.optString("password", "");
                if (serverUrl.isEmpty() || username.isEmpty() || password.isEmpty()) {
                    return cors(newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json",
                        "{\"error\":\"Missing Xtream serverUrl, username, or password\"}"));
                }
                StringBuilder target = new StringBuilder(serverUrl).append("/player_api.php?username=")
                    .append(URLEncoder.encode(username, "UTF-8")).append("&password=")
                    .append(URLEncoder.encode(password, "UTF-8"));
                String action = body.optString("action", "");
                if (!action.isEmpty()) target.append("&action=").append(URLEncoder.encode(action, "UTF-8"));
                org.json.JSONObject extra = body.optJSONObject("params");
                if (extra != null) {
                    java.util.Iterator<String> keys = extra.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        Object value = extra.opt(key);
                        if (value != null && value != org.json.JSONObject.NULL) {
                            target.append("&").append(URLEncoder.encode(key, "UTF-8")).append("=")
                                .append(URLEncoder.encode(String.valueOf(value), "UTF-8"));
                        }
                    }
                }
                HttpURLConnection xtream = (HttpURLConnection) new URL(target.toString()).openConnection();
                xtream.setConnectTimeout(15000);
                xtream.setReadTimeout(30000);
                xtream.setRequestProperty("User-Agent", "IPTVnator/0.25.0");
                xtream.setRequestProperty("Accept", "application/json");
                int status = xtream.getResponseCode();
                InputStream data = status >= 400 ? xtream.getErrorStream() : xtream.getInputStream();
                String json = data == null ? "{}" : readText(data);
                xtream.disconnect();
                if (status >= 400) return cors(newFixedLengthResponse(Response.Status.BAD_GATEWAY, "application/json", "{\"error\":\"Xtream API request failed\"}"));
                return cors(newFixedLengthResponse(Response.Status.OK, "application/json", json));
            } catch (Exception error) {
                return cors(newFixedLengthResponse(Response.Status.BAD_GATEWAY, "application/json",
                    "{\"error\":\"Xtream request failed\"}"));
            }
        }
        if (!"/api/proxy".equals(path)) {
            return cors(newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found"));
        }
        String target = params.get("url");
        if (target == null || !(target.startsWith("http://") || target.startsWith("https://"))) {
            return cors(newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "A valid HTTP(S) url is required"));
        }
        HttpURLConnection connection = null;
        try {
            URL url = new URL(target);
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestMethod("HEAD".equalsIgnoreCase(session.getMethod().name()) ? "HEAD" : "GET");
            connection.setRequestProperty("User-Agent", safeHeader(params.get("userAgent"),
                "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36"));
            connection.setRequestProperty("Accept", "*/*");
            String referer = params.get("referer");
            if (referer != null && !referer.isEmpty()) connection.setRequestProperty("Referer", referer);
            String range = session.getHeaders().get("range");
            if (range != null) connection.setRequestProperty("Range", range);

            int code = connection.getResponseCode();
            String contentType = connection.getContentType();
            String lowerUrl = target.toLowerCase(Locale.ROOT);
            boolean manifest = lowerUrl.contains(".m3u8") ||
                (contentType != null && contentType.toLowerCase(Locale.ROOT).contains("mpegurl"));
            if (code >= 400) {
                InputStream error = connection.getErrorStream();
                String detail = error == null ? "Upstream HTTP " + code : readText(error);
                connection.disconnect();
                return cors(newFixedLengthResponse(Response.Status.BAD_GATEWAY, "text/plain",
                    "Upstream HTTP " + code + ": " + detail));
            }
            if (manifest && !"HEAD".equalsIgnoreCase(session.getMethod().name())) {
                String body = readText(connection.getInputStream());
                if (body.trim().startsWith("#EXTM3U")) {
                    String finalUrl = connection.getURL().toString();
                    StringBuilder rewritten = new StringBuilder();
                    for (String line : body.split("\\r?\\n", -1)) {
                        String trimmed = line.trim();
                        if (trimmed.isEmpty()) { rewritten.append(line).append('\n'); continue; }
                        if (trimmed.startsWith("#")) {
                            String out = line;
                            java.util.regex.Matcher m = java.util.regex.Pattern.compile("URI=\"([^\"]+)\"").matcher(line);
                            if (m.find() && (m.group(1).startsWith("http://") || m.group(1).startsWith("https://") || !m.group(1).startsWith("data:"))) {
                                String absolute = new URL(new URL(finalUrl), m.group(1)).toString();
                                out = line.substring(0, m.start(1)) + loopbackUrl(absolute, params) + line.substring(m.end(1));
                            }
                            rewritten.append(out).append('\n');
                        } else {
                            try { rewritten.append(loopbackUrl(new URL(new URL(finalUrl), trimmed).toString(), params)).append('\n'); }
                            catch (Exception ignored) { rewritten.append(line).append('\n'); }
                        }
                    }
                    connection.disconnect();
                    return cors(newFixedLengthResponse(Response.Status.OK, "application/vnd.apple.mpegurl", rewritten.toString()));
                }
                connection.disconnect();
                return cors(newFixedLengthResponse(Response.Status.OK, contentType == null ? "application/octet-stream" : contentType, body));
            }

            InputStream input = "HEAD".equalsIgnoreCase(session.getMethod().name())
                ? new ByteArrayInputStream(new byte[0]) : connection.getInputStream();
            String mime = contentType == null ? "application/octet-stream" : contentType;
            Response response = newChunkedResponse(code == 206 ? Response.Status.PARTIAL_CONTENT : Response.Status.OK, mime,
                new DisconnectingInputStream(input, connection));
            response.addHeader("Cache-Control", "no-store, no-cache, must-revalidate");
            String length = connection.getHeaderField("Content-Length");
            if (length != null) response.addHeader("X-Upstream-Content-Length", length);
            String contentRange = connection.getHeaderField("Content-Range");
            if (contentRange != null) response.addHeader("Content-Range", contentRange);
            String acceptRanges = connection.getHeaderField("Accept-Ranges");
            if (acceptRanges != null) response.addHeader("Accept-Ranges", acceptRanges);
            return cors(response);
        } catch (Exception error) {
            if (connection != null) connection.disconnect();
            return cors(newFixedLengthResponse(Response.Status.BAD_GATEWAY, "text/plain",
                "Embedded media bridge failed: " + error.getClass().getSimpleName()));
        }
    }

    private static String safeHeader(String value, String fallback) {
        if (value == null || value.trim().isEmpty() || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) return fallback;
        return value;
    }
    private static String readText(InputStream in) throws Exception {
        try (InputStream source = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384]; int count;
            while ((count = source.read(buffer)) != -1) out.write(buffer, 0, count);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    private static String loopbackUrl(String target, Map<String, String> params) throws Exception {
        StringBuilder result = new StringBuilder("http://127.0.0.1:8765/api/proxy?url=")
            .append(URLEncoder.encode(target, "UTF-8"));
        String ua = params.get("userAgent");
        String ref = params.get("referer");
        if (ua != null) result.append("&userAgent=").append(URLEncoder.encode(ua, "UTF-8"));
        if (ref != null) result.append("&referer=").append(URLEncoder.encode(ref, "UTF-8"));
        return result.toString();
    }
    private static Response cors(Response response) {
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        response.addHeader("Access-Control-Allow-Headers", "Range, Content-Type, Authorization");
        response.addHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
        return response;
    }
    private static final class DisconnectingInputStream extends java.io.FilterInputStream {
        private final HttpURLConnection connection;
        DisconnectingInputStream(InputStream input, HttpURLConnection connection) { super(input); this.connection = connection; }
        @Override public void close() throws java.io.IOException {
            try { super.close(); } finally { connection.disconnect(); }
        }
    }
}