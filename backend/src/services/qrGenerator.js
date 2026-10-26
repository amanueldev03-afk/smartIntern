import QRCode from 'qrcode';

export const generateBase64QR = async (dataContent) => {
  try {
    const dataUri = await QRCode.toDataURL(dataContent, {
      errorCorrectionLevel: 'M',
      margin: 3,
      scale: 8,
      color: {
        dark: '#000000',
        light: '#ffffff',
      }
    });
    return dataUri;
  } catch (err) {
    console.error('Error generating QR code:', err);
    return '';
  }
};
