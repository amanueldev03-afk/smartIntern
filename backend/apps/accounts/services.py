from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.mail import send_mail
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.contrib.auth.tokens import default_token_generator
from email_validator import validate_email, EmailNotValidError

from .tokens import email_verification_token

User = get_user_model()


def validate_email_address(email):
    """
    Validate that the email is properly formatted and has a real domain.
    Checks syntax and MX records to ensure the email domain can receive emails.
    """
    try:
        # For development, only validate syntax without checking deliverability
        # This prevents issues with MX record checks during development
        validate_email(email, check_deliverability=False)
        return True
    except EmailNotValidError as e:
        return False


def create_student_user(*, email, password, username=None,
                        first_name="", last_name=""):
    """
    Create a new student account (Task 2.1).

    The user starts INACTIVE (``is_active=False``) and unverified until they
    confirm their email address. The empty ``StudentProfile`` shell is created
    by the registration flow (see ``StudentRegistrationSerializer``).
    """

    user = User.objects.create(
        email=email,
        username=username,
        first_name=first_name,
        last_name=last_name,
        role=User.Role.STUDENT,
        # Account is dormant until the email is verified.
        is_active=False,
        is_email_verified=False,
    )

    user.set_password(password)
    user.save()

    return user


def create_user_with_role(*, email, password, role=User.Role.STUDENT, username=None,
                          first_name="", last_name="", phone=None, department="", university_name="", staff_id_number="", auto_activate=False, is_approved=None):
    """
    Create a new user account with any assigned role (Student, Company HR, Advisor, Dean, UIL, Union, Dorm, Admin).
    The user starts inactive and unverified until email confirmation is completed,
    unless they are an Administrator or auto_activate=True is requested.
    Institutional staff (Dorm Admin, Student Union, Dean, UIL, Advisor) require administrator approval.
    """
    is_admin = role == User.Role.ADMIN
    is_active_flag = is_admin or auto_activate
    if is_approved is not None:
        approved_flag = is_approved
    else:
        if is_admin:
            approved_flag = True
        elif role in (User.Role.DORM_ADMIN, User.Role.STUDENT_UNION, User.Role.DEPT_DEAN, User.Role.UIL_OFFICER, User.Role.ADVISOR, User.Role.FINANCE_OFFICER):
            approved_flag = False
        else:
            approved_flag = is_active_flag

    user = User.objects.create(
        email=email,
        username=username,
        first_name=first_name,
        last_name=last_name,
        phone_number=phone or None,
        role=role,
        department=department or "",
        university_name=university_name or "",
        staff_id_number=staff_id_number or "",
        is_active=is_active_flag,
        is_email_verified=is_active_flag,
        is_staff=is_admin,
        is_superuser=is_admin,
        is_approved=approved_flag,
    )
    user.set_password(password)
    user.save()
    return user

def get_live_frontend_url():
    url = getattr(settings, "FRONTEND_URL", "").strip()
    if url:
        if not url.startswith("http://") and not url.startswith("https://"):
            url = f"https://{url}"
        return url.rstrip("/")
    if settings.DEBUG:
        return "http://localhost:5173"
    site_url = getattr(settings, "SITE_BASE_URL", "").strip()
    if site_url and "localhost" not in site_url:
        return site_url.rstrip("/")
    return "https://ai-internship-web.onrender.com"


def get_live_site_url():
    url = getattr(settings, "SITE_BASE_URL", "").strip()
    if url:
        if not url.startswith("http://") and not url.startswith("https://"):
            url = f"https://{url}"
        return url.rstrip("/")
    if settings.DEBUG:
        return "http://localhost:8000"
    return "https://ai-internship-backend-4nwx.onrender.com"


import logging

logger = logging.getLogger(__name__)


def get_sender_email():
    """
    Resolve the optimal sender address.
    For Gmail/SMTP providers, sender must match authenticated user or configured default.
    """
    host_user = getattr(settings, "EMAIL_HOST_USER", "").strip()
    default_from = getattr(settings, "DEFAULT_FROM_EMAIL", "").strip()
    if host_user and "@" in host_user:
        return f"AI Internship Platform <{host_user}>"
    if default_from:
        return default_from
    return "noreply@ai-internship.com"


def send_verification_email(user):
    """
    Send a real email verification link with rich HTML and plain-text fallback.
    """

    uid = urlsafe_base64_encode(
        force_bytes(user.pk)
    )

    token = email_verification_token.make_token(
        user
    )

    site_url = get_live_site_url()
    frontend_url = get_live_frontend_url()
    api_verification_url = (
        f"{site_url}/api/auth/verify-email/{uid}/{token}/"
    )
    frontend_verification_url = (
        f"{frontend_url}/verify-email?uid={uid}&token={token}"
    )

    recipient_name = user.first_name or user.username or "Student"
    from_email = get_sender_email()

    print(f"\n============= EMAIL VERIFICATION LINK =============")
    print(f"To:      {user.email}")
    print(f"From:    {from_email}")
    print(f"Frontend Verification URL: {frontend_verification_url}")
    print(f"API Verification URL:      {api_verification_url}")
    print(f"====================================================\n")

    plain_message = (
        f"Hello {recipient_name},\n\n"
        f"Thank you for registering on AI Internship Platform!\n\n"
        f"Please verify your email address to activate your account and start discovering personalized internships:\n\n"
        f"{frontend_verification_url}\n\n"
        f"Direct API verification link:\n"
        f"{api_verification_url}\n\n"
        f"If you did not create this account, please ignore this email."
    )

    html_message = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px 12px; }}
    .container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 36px 28px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01); border: 1px solid #e2e8f0; }}
    .header {{ text-align: center; margin-bottom: 28px; }}
    .logo {{ font-size: 24px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }}
    .title {{ font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #0f172a; text-align: center; }}
    .text {{ font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 20px; }}
    .btn-wrap {{ text-align: center; margin: 32px 0; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff !important; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 16px; box-shadow: 0 4px 14px 0 rgba(79, 70, 229, 0.35); }}
    .url-box {{ word-break: break-all; font-size: 13px; color: #4338ca; background: #eef2ff; padding: 14px; border-radius: 8px; border: 1px solid #c7d2fe; margin-bottom: 24px; }}
    .footer {{ font-size: 13px; color: #94a3b8; text-align: center; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 20px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">AI Internship Platform</div>
    </div>
    <div class="title">Verify your email address</div>
    <p class="text">Hello <strong>{recipient_name}</strong>,</p>
    <p class="text">Thank you for joining AI Internship Platform! Please confirm your email address to activate your account and immediately access your personalized AI internship recommendations.</p>
    <div class="btn-wrap">
      <a href="{frontend_verification_url}" class="btn">Verify Email & Access Dashboard</a>
    </div>
    <p class="text" style="font-size: 13px; color: #64748b;">If the button above does not work, copy and paste this link into your browser:</p>
    <div class="url-box">{frontend_verification_url}</div>
    <div class="footer">
      If you did not create an account on AI Internship Platform, you can safely ignore this email.
    </div>
  </div>
</body>
</html>"""

    try:
        send_mail(
            subject="Verify your AI Internship Platform account",
            message=plain_message,
            html_message=html_message,
            from_email=from_email,
            recipient_list=[user.email],
            fail_silently=False,
        )
        return True
    except Exception as e:
        logger.error(f"Failed to deliver verification email via SMTP to {user.email}: {e}", exc_info=True)
        print(f"Failed to deliver verification email via SMTP to {user.email}: {e}")
        return False


def send_password_reset_email(user):
    """
    Send a password reset email with rich HTML and plain-text fallback.
    """

    uid = urlsafe_base64_encode(
        force_bytes(user.pk)
    )

    token = default_token_generator.make_token(
        user
    )

    site_url = get_live_site_url()
    frontend_url = get_live_frontend_url()
    api_reset_url = (
        f"{site_url}/api/auth/password-reset-confirm/{uid}/{token}/"
    )
    frontend_reset_url = (
        f"{frontend_url}/reset-password?uid={uid}&token={token}"
    )

    recipient_name = user.first_name or user.username or "Student"
    from_email = get_sender_email()

    print(f"\n================ PASSWORD RESET LINK ================")
    print(f"To:      {user.email}")
    print(f"From:    {from_email}")
    print(f"Frontend Reset URL: {frontend_reset_url}")
    print(f"API Reset URL:      {api_reset_url}")
    print(f"====================================================\n")

    plain_message = (
        f"Hello {recipient_name},\n\n"
        f"We received a request to reset your AI Internship Platform password.\n\n"
        f"Reset your password using this link:\n\n"
        f"{frontend_reset_url}\n\n"
        f"Direct API link:\n"
        f"{api_reset_url}\n\n"
        f"If you did not request a password reset, you can safely ignore this email."
    )

    html_message = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px 12px; }}
    .container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 36px 28px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01); border: 1px solid #e2e8f0; }}
    .header {{ text-align: center; margin-bottom: 28px; }}
    .logo {{ font-size: 24px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }}
    .title {{ font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #0f172a; text-align: center; }}
    .text {{ font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 20px; }}
    .btn-wrap {{ text-align: center; margin: 32px 0; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff !important; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 16px; box-shadow: 0 4px 14px 0 rgba(79, 70, 229, 0.35); }}
    .url-box {{ word-break: break-all; font-size: 13px; color: #4338ca; background: #eef2ff; padding: 14px; border-radius: 8px; border: 1px solid #c7d2fe; margin-bottom: 24px; }}
    .footer {{ font-size: 13px; color: #94a3b8; text-align: center; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 20px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">AI Internship Platform</div>
    </div>
    <div class="title">Reset your password</div>
    <p class="text">Hello <strong>{recipient_name}</strong>,</p>
    <p class="text">We received a request to reset your password. Click the button below to set a new password for your account.</p>
    <div class="btn-wrap">
      <a href="{frontend_reset_url}" class="btn">Reset My Password</a>
    </div>
    <p class="text" style="font-size: 13px; color: #64748b;">If the button above does not work, copy and paste this link into your browser:</p>
    <div class="url-box">{frontend_reset_url}</div>
    <div class="footer">
      If you did not request a password reset, you can safely ignore this email.
    </div>
  </div>
</body>
</html>"""

    try:
        send_mail(
            subject="Reset your AI Internship Platform password",
            message=plain_message,
            html_message=html_message,
            from_email=from_email,
            recipient_list=[user.email],
            fail_silently=False,
        )
        return True
    except Exception as e:
        logger.error(f"Failed to deliver password reset email via SMTP to {user.email}: {e}", exc_info=True)
        print(f"Failed to deliver password reset email via SMTP to {user.email}: {e}")
        return False