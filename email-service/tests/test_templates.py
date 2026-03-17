"""Basic tests for template rendering."""

from app.services.template_engine import render_template, set_custom_template


def test_default_notification_template():
    html = render_template("defaults/notification", {"title": "Test", "body": "Hello"})
    assert "Test" in html
    assert "Hello" in html
    assert "OrbisPM" in html


def test_password_reset_template():
    html = render_template("password_reset", {"reset_url": "https://example.com/reset", "reset_code": "123456"})
    assert "123456" in html
    assert "Reset" in html


def test_otp_template():
    html = render_template("otp", {"otp_code": "987654"})
    assert "987654" in html


def test_custom_template_override():
    set_custom_template("org-1", "notification", "<h1>Custom: {{ title }}</h1>")
    html = render_template("notification", {"title": "Hello"}, org_id="org-1")
    assert "Custom: Hello" in html


def test_fallback_to_default():
    html = render_template("nonexistent_template", {"title": "Fallback", "body": "Works"})
    assert "Fallback" in html
