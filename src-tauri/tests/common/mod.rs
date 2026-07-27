use image::codecs::jpeg::JpegEncoder;
use image::{ImageBuffer, ImageFormat, Rgb, Rgba};
use std::fs;
use std::path::{Path, PathBuf};

pub fn patterned_png(directory: &Path) -> PathBuf {
    let path = directory.join("pattern.png");
    let image = ImageBuffer::from_fn(5, 3, |x, y| {
        Rgba([(x * 20) as u8, (y * 40) as u8, 100, 255])
    });
    image.save_with_format(&path, ImageFormat::Png).unwrap();
    path
}

pub fn solid_image(directory: &Path, name: &str, width: u32, height: u32) -> PathBuf {
    let path = directory.join(name);
    let format = ImageFormat::from_path(&path).unwrap();
    let image = ImageBuffer::from_pixel(width, height, Rgb([30_u8, 80, 120]));
    image.save_with_format(&path, format).unwrap();
    path
}

pub fn oriented_jpeg(directory: &Path, orientation: u16) -> PathBuf {
    let path = directory.join(format!("orientation-{orientation}.jpg"));
    let image = ImageBuffer::from_fn(40, 20, |x, y| {
        let color = match (x < 20, y < 10) {
            (true, true) => [240_u8, 20, 20],
            (false, true) => [20, 240, 20],
            (true, false) => [20, 20, 240],
            (false, false) => [240, 240, 20],
        };
        Rgb(color)
    });

    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, 100)
        .encode_image(&image)
        .unwrap();

    // APP1 payload: Exif header followed by a little-endian TIFF header and a
    // single IFD0 SHORT entry for tag 0x0112 (orientation).
    let mut exif_payload = b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0".to_vec();
    exif_payload.extend_from_slice(&orientation.to_le_bytes());
    exif_payload.extend_from_slice(&[0, 0, 0, 0, 0, 0]);
    let segment_length = u16::try_from(exif_payload.len() + 2).unwrap();

    let mut encoded = Vec::with_capacity(jpeg.len() + exif_payload.len() + 4);
    encoded.extend_from_slice(&jpeg[..2]);
    encoded.extend_from_slice(&[0xff, 0xe1]);
    encoded.extend_from_slice(&segment_length.to_be_bytes());
    encoded.extend_from_slice(&exif_payload);
    encoded.extend_from_slice(&jpeg[2..]);
    fs::write(&path, encoded).unwrap();
    path
}

#[allow(dead_code)]
pub fn assert_color_near(actual: &[u8], expected: [u8; 4]) {
    for (actual, expected) in actual.iter().zip(expected) {
        assert!(
            actual.abs_diff(expected) <= 35,
            "expected channel near {expected}, got {actual}"
        );
    }
}
