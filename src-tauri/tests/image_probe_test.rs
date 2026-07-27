mod common;

use common::{malformed_exif_jpeg, oriented_jpeg, patterned_png, solid_image};
use picture_cutting_lib::image_probe::{probe_image, ProbeError};
use std::fs;

#[test]
fn reports_png_dimensions_format_and_original_identity() {
    let directory = tempfile::tempdir().unwrap();
    let path = patterned_png(directory.path());

    let info = probe_image(&path).unwrap();

    assert_eq!(info.path, path);
    assert_eq!(info.name, "pattern.png");
    assert_eq!((info.width, info.height), (5, 3));
    assert_eq!(info.format, "png");
    assert!(!info.orientation_applied);
}

#[test]
fn accepts_png_jpeg_and_webp_by_detected_content() {
    let directory = tempfile::tempdir().unwrap();

    for (name, expected_format) in [
        ("source.png", "png"),
        ("source.jpg", "jpeg"),
        ("source.webp", "webp"),
    ] {
        let path = solid_image(directory.path(), name, 7, 4);
        let info = probe_image(&path).unwrap();
        assert_eq!(info.format, expected_format);
        assert_eq!((info.width, info.height), (7, 4));
    }
}

#[test]
fn rejects_unknown_unsupported_and_damaged_files_with_typed_errors() {
    let directory = tempfile::tempdir().unwrap();

    let unknown = directory.path().join("unknown.bin");
    fs::write(&unknown, b"not an image").unwrap();
    let error = probe_image(&unknown).unwrap_err();
    assert!(matches!(error, ProbeError::UnsupportedFormat { .. }));
    assert!(error.to_string().contains("supported PNG, JPEG, or WebP"));

    let gif = directory.path().join("unsupported.gif");
    fs::write(&gif, b"GIF89a").unwrap();
    assert!(matches!(
        probe_image(&gif),
        Err(ProbeError::UnsupportedFormat { .. })
    ));

    let damaged = directory.path().join("damaged.png");
    fs::write(&damaged, b"\x89PNG\r\n\x1a\ntruncated").unwrap();
    let error = probe_image(&damaged).unwrap_err();
    assert!(matches!(error, ProbeError::Decode { .. }));
    assert!(error.to_string().contains("read image dimensions"));
}

#[test]
fn reports_post_orientation_dimensions_for_exif_jpeg() {
    let directory = tempfile::tempdir().unwrap();
    let path = oriented_jpeg(directory.path(), 6);

    let info = probe_image(&path).unwrap();

    assert_eq!((info.width, info.height), (20, 40));
    assert!(info.orientation_applied);
}

#[test]
fn ignores_malformed_optional_exif_in_an_otherwise_valid_jpeg() {
    let directory = tempfile::tempdir().unwrap();
    let path = malformed_exif_jpeg(directory.path());

    let info = probe_image(&path).unwrap();

    assert_eq!((info.width, info.height), (40, 20));
    assert!(!info.orientation_applied);
}
