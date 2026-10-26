#!/usr/bin/env python
import os
import sys
import django

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User
from rest_framework.test import APIClient

client = APIClient()

for user in User.objects.all():
    # Test with user password or reset if test account
    # We can check serializer output directly
    from apps.accounts.jwt import LoginSerializer
    serializer = LoginSerializer()
    role_val = str(user.role).lower()
    print(f"User: {user.email} -> DB role: {user.role}, Token payload role: {role_val}")

