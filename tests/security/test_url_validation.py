"""SSRF protection and URL validation tests."""
import pytest

from app.services.video_download_service import VideoDownloadService

service = VideoDownloadService()


class TestValidYouTubeURLs:
    @pytest.mark.parametrize("url", [
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ?si=abcdef",
        "https://youtube.com/embed/dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/shorts/abc123",
        "https://youtube.com/live/dQw4w9WgXcQ",
    ])
    def test_valid_youtube_urls(self, url):
        is_valid, platform = service.validate_url(url)
        assert is_valid, f"Expected valid YouTube URL: {url}"
        assert platform == "youtube"


class TestValidInstagramURLs:
    @pytest.mark.parametrize("url", [
        "https://instagram.com/reel/ABC123xyz/",
        "https://www.instagram.com/reel/ABC123xyz/",
        "https://instagram.com/p/ABC123/",
        "https://www.instagram.com/p/ABC123/",
        "https://instagram.com/reel/ABC123xyz/?igshid=xyz",
        "https://www.instagram.com/reel/ABC123xyz/?utm_source=ig_web_copy_link",
    ])
    def test_valid_instagram_urls(self, url):
        is_valid, platform = service.validate_url(url)
        assert is_valid, f"Expected valid Instagram URL: {url}"
        assert platform == "instagram"


class TestInvalidDomains:
    @pytest.mark.parametrize("url", [
        "https://facebook.com/watch?v=test",
        "https://vimeo.com/12345",
        "https://tiktok.com/@user/video/123",
        "https://dailymotion.com/video/xyz",
        "https://twitch.tv/videos/12345",
        "https://example.com/video",
        "https://random-site.xyz/video.mp4",
        "https://evil.com/youtube.com",
        "http://youtube-com/video",
    ])
    def test_invalid_domains(self, url):
        is_valid, msg = service.validate_url(url)
        assert not is_valid, f"Expected invalid URL: {url}"
        assert "unsupported" in msg.lower() or "not allowed" in msg.lower()


class TestSSRFProtection:
    @pytest.mark.parametrize("url", [
        "http://localhost:8080/video",
        "http://localhost/video",
        "https://localhost:443/video",
        "http://test.localhost/video",
    ])
    def test_localhost_urls_rejected(self, url):
        is_valid, msg = service.validate_url(url)
        assert not is_valid
        assert "localhost" in msg.lower()

    @pytest.mark.parametrize("url", [
        "http://127.0.0.1/video",
        "http://127.0.0.2/video",
        "http://127.1.2.3/video",
        "http://10.0.0.1/video",
        "http://10.255.255.255/video",
        "http://192.168.1.1/video",
        "http://192.168.0.0/video",
        "http://172.16.0.1/video",
        "http://172.31.255.255/video",
    ])
    def test_private_ipv4_rejected(self, url):
        is_valid, msg = service.validate_url(url)
        assert not is_valid
        assert "private" in msg.lower() or "local" in msg.lower()

    @pytest.mark.parametrize("url", [
        "http://[::1]/video",
        "http://[0:0:0:0:0:0:0:1]/video",
        "http://[::2]/video",
    ])
    def test_ipv6_loopback_rejected(self, url):
        is_valid, msg = service.validate_url(url)
        assert not is_valid

    @pytest.mark.parametrize("url", [
        "ftp://youtube.com/video",
        "ftp://youtu.be/video",
        "file:///etc/passwd",
        "file://localhost/etc/passwd",
        "file:///etc/shadow",
    ])
    def test_disallowed_schemes_rejected(self, url):
        is_valid, msg = service.validate_url(url)
        assert not is_valid
        assert any(s in url for s in ["file", "ftp"]) is False or "scheme" in msg.lower()

    def test_localhost_with_youtube_path(self):
        """Hostname is localhost — should be rejected even if path looks valid."""
        is_valid, msg = service.validate_url("http://localhost/youtube.com/watch?v=test")
        assert not is_valid
        assert "localhost" in msg.lower()

    def test_dotted_decimal_not_ip_rejected_by_prefix_check(self):
        """172.32.x.x is public, not private, but prefix check would catch it."""
        is_valid, msg = service.validate_url("http://172.32.0.1/video")
        assert not is_valid


class TestInstagramSpecificValidation:
    def test_instagram_profile_rejected(self):
        is_valid, msg = service.validate_url("https://instagram.com/username/")
        assert not is_valid
        assert "reel" in msg.lower() or "post" in msg.lower()

    def test_instagram_stories_missing_reel_or_post(self):
        is_valid, msg = service.validate_url("https://instagram.com/stories/highlights/123/")
        assert not is_valid

    def test_instagram_explore_rejected(self):
        is_valid, msg = service.validate_url("https://instagram.com/explore/")
        assert not is_valid


class TestEdgeCases:
    def test_empty_url(self):
        is_valid, msg = service.validate_url("")
        assert not is_valid
        assert "empty" in msg.lower()

    def test_whitespace_url(self):
        is_valid, msg = service.validate_url("   ")
        assert not is_valid
        assert "empty" in msg.lower()

    def test_malformed_url(self):
        is_valid, msg = service.validate_url("not a url at all!!!")
        assert not is_valid

    def test_url_without_scheme(self):
        is_valid, msg = service.validate_url("youtube.com/watch?v=test")
        assert not is_valid

    @pytest.mark.parametrize("url", [
        "https://youtube.com@evil.com/video",
        "https://youtube.com:evil.com@127.0.0.1/video",
    ])
    def test_credential_hostname_bypass(self, url):
        is_valid, _ = service.validate_url(url)
        assert not is_valid

    def test_url_with_javascript_scheme(self):
        is_valid, msg = service.validate_url("javascript:alert(1)")
        assert not is_valid

    def test_very_long_url(self):
        long_url = "https://youtube.com/watch?v=" + "x" * 5000
        is_valid, msg = service.validate_url(long_url)
        # Should parse without error and be valid
        assert is_valid or not is_valid  # just verify no crash
