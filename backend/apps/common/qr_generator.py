import io
import base64
import qrcode


def generate_base64_qr(data_content: str) -> str:
    """
    Generates an in-memory PNG QR code for the provided data string,
    encoded as a base64 Data URI: data:image/png;base64,...
    Can be directly rendered in standard HTML/React <img> tags without external assets.
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=3,
    )
    qr.add_data(data_content)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"
