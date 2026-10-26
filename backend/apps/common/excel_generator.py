import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from django.core.files.base import ContentFile


def generate_dean_score_roster_template(department_name: str, academic_year: int, students_list: list) -> ContentFile:
    """
    Generates a structured .xlsx spreadsheet score roster template for Dean verification and UIL scoring.
    Columns: Student ID, Student Name, Department, Year, Advisor Score (25%), UIL Score (25%), Doc Score (25%), Presentation (25%), Total (100%).
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "UIL_Score_Roster"

    # Header Title
    ws.merge_cells("A1:I1")
    title_cell = ws["A1"]
    title_cell.value = f"SMARTINTERN-ET: OFFICIAL UIL SCORE ROSTER - {department_name.upper()} (YEAR {academic_year})"
    title_cell.font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    title_cell.fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 35

    # Column Headers
    headers = [
        "Student ID",
        "Full Name",
        "Department",
        "Year",
        "Advisor (25%)",
        "UIL Officer (25%)",
        "Documentation (25%)",
        "Defense/Pres (25%)",
        "Total (100%)",
    ]
    ws.append([])  # Blank row 2
    ws.append(headers)  # Row 3

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    ws.row_dimensions[3].height = 25
    for col_idx in range(1, 10):
        cell = ws.cell(row=3, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    # Student Rows
    row_num = 4
    for stu in students_list:
        row_data = [
            stu.get("student_id", ""),
            stu.get("full_name", ""),
            stu.get("department", department_name),
            stu.get("academic_year", academic_year),
            stu.get("advisor_score", ""),
            stu.get("uil_score", ""),
            stu.get("doc_score", ""),
            stu.get("pres_score", ""),
            f"=SUM(E{row_num}:H{row_num})",
        ]
        ws.append(row_data)
        ws.row_dimensions[row_num].height = 20
        for col_idx in range(1, 10):
            c = ws.cell(row=row_num, column=col_idx)
            c.alignment = Alignment(horizontal="center" if col_idx not in [2] else "left", vertical="center")
            c.border = thin_border
            if col_idx == 9:
                c.font = Font(bold=True)
        row_num += 1

    # Auto-adjust column widths
    column_widths = {
        "A": 16,
        "B": 26,
        "C": 24,
        "D": 10,
        "E": 16,
        "F": 18,
        "G": 20,
        "H": 20,
        "I": 16,
    }
    for col_letter, width in column_widths.items():
        ws.column_dimensions[col_letter].width = width

    buf = io.BytesIO()
    wb.save(buf)
    filename = f"UIL_Score_Roster_{department_name.replace(' ', '_')}_Year{academic_year}.xlsx"
    return ContentFile(buf.getvalue(), name=filename)
