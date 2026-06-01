"""
Tests for the public tenant signup flow: validation, slug generation,
and atomic tenant+user creation.
"""

import pytest

from apps.tenants.public_views import _unique_slug, _validate_signup_data
from tests.factories import TenantFactory, UserFactory


class TestValidateSignupData:
    """Tests for _validate_signup_data() helper."""

    @pytest.fixture
    def valid_data(self):
        return {
            "business_name": "My Gym",
            "email": "owner@mygym.com",
            "first_name": "Jane",
            "last_name": "Doe",
            "password": "securepass123",
            "payment_method_id": "pm_test_123",
        }

    def test_valid_data_returns_no_errors(self, db, valid_data):
        errors = _validate_signup_data(valid_data)
        assert errors == {}

    def test_missing_business_name(self, db, valid_data):
        valid_data["business_name"] = ""
        errors = _validate_signup_data(valid_data)
        assert "business_name" in errors

    def test_missing_email(self, db, valid_data):
        del valid_data["email"]
        errors = _validate_signup_data(valid_data)
        assert "email" in errors

    def test_missing_password(self, db, valid_data):
        valid_data["password"] = ""
        errors = _validate_signup_data(valid_data)
        assert "password" in errors

    def test_short_password(self, db, valid_data):
        valid_data["password"] = "short"
        errors = _validate_signup_data(valid_data)
        assert "password" in errors
        assert "8 characters" in errors["password"]

    def test_duplicate_email(self, db, valid_data):
        tenant = TenantFactory()
        UserFactory(tenant=tenant, email="owner@mygym.com")

        errors = _validate_signup_data(valid_data)
        assert "email" in errors
        assert "already exists" in errors["email"]

    def test_non_string_payment_method_id(self, db, valid_data):
        valid_data["payment_method_id"] = 12345  # not a string
        errors = _validate_signup_data(valid_data)
        assert "payment_method_id" in errors

    def test_whitespace_only_fields_rejected(self, db, valid_data):
        valid_data["first_name"] = "   "
        errors = _validate_signup_data(valid_data)
        assert "first_name" in errors

    def test_all_fields_missing(self, db):
        errors = _validate_signup_data({})
        for field in [
            "business_name",
            "email",
            "first_name",
            "last_name",
            "password",
            "payment_method_id",
        ]:
            assert field in errors


class TestUniqueSlug:
    """Tests for the _unique_slug() helper."""

    def test_generates_slug_from_name(self, db):
        slug = _unique_slug("My Awesome Gym")
        assert slug == "my-awesome-gym"

    def test_appends_suffix_for_duplicate(self, db):
        TenantFactory(slug="my-gym")
        slug = _unique_slug("My Gym")
        assert slug == "my-gym-1"

    def test_increments_suffix_for_multiple_duplicates(self, db):
        TenantFactory(slug="fitness-hub")
        TenantFactory(slug="fitness-hub-1")
        slug = _unique_slug("Fitness Hub")
        assert slug == "fitness-hub-2"

    def test_empty_name_uses_fallback(self, db):
        slug = _unique_slug("")
        assert slug == "gym"

    def test_special_characters_stripped(self, db):
        slug = _unique_slug("Gym & Spa!")
        assert slug == "gym-spa"
