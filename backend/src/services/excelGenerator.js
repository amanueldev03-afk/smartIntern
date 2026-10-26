import ExcelJS from 'exceljs';

export const generateDeanScoreRosterTemplate = async (departmentName = 'Software Engineering', academicYear = 4, studentsList = []) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('UIL_Score_Roster');

  // Title Row (A1:I1)
  worksheet.mergeCells('A1:I1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `SMARTINTERN-ET: OFFICIAL UIL SCORE ROSTER - ${departmentName.toUpperCase()} (YEAR ${academicYear})`;
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 35;

  // Headers (Row 3)
  const headers = [
    'Student ID', 'Full Name', 'Department', 'Year',
    'Advisor (25%)', 'UIL Officer (25%)', 'Documentation (25%)', 'Defense/Pres (25%)', 'Total (100%)'
  ];

  worksheet.addRow([]); // Blank row 2
  const headerRow = worksheet.addRow(headers); // Row 3
  headerRow.height = 25;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Student rows
  let rowIdx = 4;
  studentsList.forEach(stu => {
    const row = worksheet.addRow([
      stu.student_id || '',
      stu.full_name || '',
      stu.department || departmentName,
      stu.academic_year || academicYear,
      stu.advisor_score || '',
      stu.uil_score || '',
      stu.doc_score || '',
      stu.pres_score || '',
      { formula: `SUM(E${rowIdx}:H${rowIdx})` },
    ]);
    row.height = 20;

    row.eachCell((cell, colNum) => {
      cell.alignment = { horizontal: colNum === 2 ? 'left' : 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
      if (colNum === 9) {
        cell.font = { bold: true };
      }
    });

    rowIdx++;
  });

  // Column widths
  worksheet.columns = [
    { width: 16 }, // A
    { width: 26 }, // B
    { width: 24 }, // C
    { width: 10 }, // D
    { width: 16 }, // E
    { width: 18 }, // F
    { width: 20 }, // G
    { width: 20 }, // H
    { width: 16 }, // I
  ];

  return workbook.xlsx.writeBuffer();
};
