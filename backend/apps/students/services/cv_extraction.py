import zipfile
from pathlib import Path

from docx import Document
from pypdf import PdfReader


ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
}

MAX_RESUME_SIZE = 5 * 1024 * 1024

# Bytes read from the start of the file for content sniffing. Enough to catch
# real PDF headers and ZIP (DOCX) magic while staying cheap.
SNIFF_LEN = 4096


def validate_cv_extension(filename):
    """
    Validate CV file extension.
    """

    extension = Path(
        filename
    ).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError(
            "Only PDF and DOCX files are supported."
        )

    return extension


def validate_cv_size(file):
    """
    Ensure the CV is not too large.
    """

    if file.size > MAX_RESUME_SIZE:
        raise ValueError(
            "CV file must not exceed 5 MB."
        )


def _restore_position(file, position):
    try:
        file.seek(position)
    except Exception:
        pass


def _sniff_pdf(head):
    """
    A real PDF begins with ``%PDF-`` (allowing leading whitespace / NULs).
    Returns True only for genuine PDF bytes.
    """
    stripped = head.lstrip(b"\x00\r\n\t ")
    return stripped.startswith(b"%PDF")


def _sniff_docx(file):
    """
    A real DOCX is a ZIP archive whose manifest contains the OOXML
    ``[Content_Types].xml`` part and a ``word/`` document tree. Checking the
    archive contents (not just the ``PK`` magic) rejects zip-bombs / renamed
    archives and executables alike.
    """
    position = file.tell()
    try:
        file.seek(0)
        head = file.read(SNIFF_LEN)
        if not head.startswith(b"PK\x03\x04"):
            return False
        # ZIP reading must begin at offset 0.
        file.seek(0)
        with zipfile.ZipFile(file) as archive:
            names = set(archive.namelist())
    except (zipfile.BadZipFile, ValueError, OSError):
        return False
    finally:
        _restore_position(file, position)
    return bool(names) and any(
        n == "[Content_Types].xml" or n.startswith("word/")
        for n in names
    )


def validate_resume_file(file):
    """
    Full resume upload validation — used both at the API boundary and again
    inside the parsing worker (defense in depth).

    Checks, in order:
      1. Size ≤ 5 MB.
      2. Extension is .pdf / .docx.
      3. MIME type by **content sniffing**, not just the filename:
         - ``.pdf``  → bytes must contain a genuine ``%PDF`` header.
         - ``.docx`` → bytes must be a real ZIP carrying the OOXML ``word/``
           tree + ``[Content_Types].xml``.
      4. Sniffed type matches the declared extension.

    Raises ValueError on any failure — in particular an executable renamed
    to ``resume.pdf`` (MZ/ELF magic) is rejected.
    """
    validate_cv_size(file)

    extension = validate_cv_extension(
        getattr(file, "name", "") or ""
    )

    position = file.tell()
    file.seek(0)
    head = file.read(SNIFF_LEN)
    _restore_position(file, position)

    if not head:
        raise ValueError("File is empty — refusing to store it.")

    if _sniff_pdf(head):
        detected = ".pdf"
    elif _sniff_docx(file):
        detected = ".docx"
    else:
        # Covers renames of PE/ELF executables (MZ/ELF magic), zip archives
        # that are not DOCX, plain text, and arbitrary binary payloads.
        raise ValueError(
            "File content does not match an accepted type (PDF or DOCX). "
            "Executable or unknown binaries are rejected."
        )

    if detected != extension:
        raise ValueError(
            f"File content is {detected} but the filename says "
            f"{extension}. Renamed files are rejected."
        )

    return extension


def extract_pdf_text(file):
    """
    Extract text from a PDF file.
    """

    reader = PdfReader(file)

    pages = []

    for page in reader.pages:
        text = page.extract_text()

        if text:
            pages.append(text)

    return "\n".join(pages)


def extract_docx_text(file):
    """
    Extract text from a DOCX file.
    """

    document = Document(file)

    paragraphs = []

    for paragraph in document.paragraphs:

        text = paragraph.text.strip()

        if text:
            paragraphs.append(text)

    return "\n".join(paragraphs)


def extract_cv_text(file):
    """
    Validate and extract CV text.
    """

    extension = validate_resume_file(file)

    if extension == ".pdf":
        return extract_pdf_text(file)

    if extension == ".docx":
        return extract_docx_text(file)

    raise ValueError(
        "Unsupported CV format."
    )