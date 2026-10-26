# Generated migration to extend User.role with FINANCE_OFFICER and all 8 institutional/company roles

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_user_phone_number_alter_user_id_alter_user_role_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('STUDENT', 'Student'),
                    ('ADMIN', 'Administrator'),
                    ('DEPT_DEAN', 'Department Dean'),
                    ('UIL_OFFICER', 'UIL Head Officer'),
                    ('ADVISOR', 'Academic Advisor'),
                    ('STUDENT_UNION', 'Student Union'),
                    ('DORM_ADMIN', 'Dormitory Admin'),
                    ('COMPANY_HR', 'Company HR'),
                    ('COMPANY_MENTOR', 'Company Mentor'),
                    ('FINANCE_OFFICER', 'Finance Officer'),
                ],
                default='STUDENT',
                max_length=30,
            ),
        ),
    ]
