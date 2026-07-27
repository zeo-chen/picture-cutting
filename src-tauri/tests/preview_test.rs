mod common;

use common::{
    assert_color_near, malformed_exif_jpeg, oriented_jpeg, oriented_jpeg_with_size, patterned_png,
    solid_image,
};
use picture_cutting_lib::preview::{generate_preview, PreviewError};
use std::fs;

#[test]
fn returns_rgba_without_upscaling_a_small_image() {
    let directory = tempfile::tempdir().unwrap();
    let path = patterned_png(directory.path());

    let preview = generate_preview(&path, 1600).unwrap();

    assert_eq!((preview.width, preview.height), (5, 3));
    assert_eq!(preview.rgba.len(), 5 * 3 * 4);
    assert_eq!(&preview.rgba[..4], &[0, 0, 100, 255]);
    assert_eq!(
        &preview.rgba[(2 * 5 + 4) * 4..(2 * 5 + 4) * 4 + 4],
        &[80, 80, 100, 255]
    );
}

#[test]
fn scales_large_image_to_max_edge_and_preserves_aspect_ratio() {
    let directory = tempfile::tempdir().unwrap();
    let path = solid_image(directory.path(), "large.png", 4000, 3000);

    let preview = generate_preview(&path, 1600).unwrap();

    assert_eq!((preview.width, preview.height), (1600, 1200));
}

#[test]
fn scales_large_oriented_image_before_applying_display_rotation() {
    let directory = tempfile::tempdir().unwrap();
    let path = oriented_jpeg_with_size(directory.path(), 6, 4000, 3000);

    let preview = generate_preview(&path, 1600).unwrap();

    assert_eq!((preview.width, preview.height), (1200, 1600));
    assert_eq!(preview.rgba.len(), 1200 * 1600 * 4);
}

#[test]
fn rejects_unreasonable_source_dimensions_before_decode() {
    let directory = tempfile::tempdir().unwrap();
    let path = solid_image(directory.path(), "too-wide.png", 20_000, 1);

    let error = generate_preview(&path, 1600).unwrap_err();

    assert!(
        matches!(
            &error,
            PreviewError::SourceTooLarge {
                width: 20_000,
                height: 1
            }
        ),
        "unexpected error: {error:?}"
    );
    assert!(error.to_string().contains("too large for a safe preview"));
}

#[test]
fn ignores_malformed_optional_exif_when_generating_preview() {
    let directory = tempfile::tempdir().unwrap();
    let path = malformed_exif_jpeg(directory.path());

    let preview = generate_preview(&path, 256).unwrap();

    assert_eq!((preview.width, preview.height), (40, 20));
}

#[test]
fn rejects_max_edge_outside_supported_range() {
    let directory = tempfile::tempdir().unwrap();
    let path = patterned_png(directory.path());

    for max_edge in [0, 255, 4097, u32::MAX] {
        let error = generate_preview(&path, max_edge).unwrap_err();
        assert!(matches!(
            &error,
            PreviewError::InvalidMaxEdge { value } if *value == max_edge
        ));
        assert!(error.to_string().contains("256 through 4096"));
    }
}

#[test]
fn applies_exif_rotation_to_dimensions_and_pixel_positions() {
    let directory = tempfile::tempdir().unwrap();
    let path = oriented_jpeg(directory.path(), 6);

    let preview = generate_preview(&path, 256).unwrap();

    assert_eq!((preview.width, preview.height), (20, 40));
    let pixel = |x: u32, y: u32| {
        let offset = ((y * preview.width + x) * 4) as usize;
        &preview.rgba[offset..offset + 4]
    };
    assert_color_near(pixel(5, 5), [20, 20, 240, 255]);
    assert_color_near(pixel(15, 5), [240, 20, 20, 255]);
    assert_color_near(pixel(5, 35), [240, 240, 20, 255]);
    assert_color_near(pixel(15, 35), [20, 240, 20, 255]);
}

#[test]
fn applies_every_exif_orientation_transform() {
    let directory = tempfile::tempdir().unwrap();
    let red = [240, 20, 20, 255];
    let green = [20, 240, 20, 255];
    let blue = [20, 20, 240, 255];
    let yellow = [240, 240, 20, 255];
    let cases = [
        (1, (40, 20), [red, green, blue, yellow]),
        (2, (40, 20), [green, red, yellow, blue]),
        (3, (40, 20), [yellow, blue, green, red]),
        (4, (40, 20), [blue, yellow, red, green]),
        (5, (20, 40), [red, blue, green, yellow]),
        (6, (20, 40), [blue, red, yellow, green]),
        (7, (20, 40), [yellow, green, blue, red]),
        (8, (20, 40), [green, yellow, red, blue]),
    ];

    for (orientation, dimensions, expected_corners) in cases {
        let path = oriented_jpeg(directory.path(), orientation);
        let preview = generate_preview(&path, 256).unwrap();
        assert_eq!((preview.width, preview.height), dimensions);

        let corners = [
            (5, 5),
            (preview.width - 6, 5),
            (5, preview.height - 6),
            (preview.width - 6, preview.height - 6),
        ];
        for ((x, y), expected) in corners.into_iter().zip(expected_corners) {
            let offset = ((y * preview.width + x) * 4) as usize;
            assert_color_near(&preview.rgba[offset..offset + 4], expected);
        }
    }
}

#[test]
fn leaves_source_file_bytes_unchanged() {
    let directory = tempfile::tempdir().unwrap();
    let path = oriented_jpeg(directory.path(), 8);
    let before = fs::read(&path).unwrap();

    generate_preview(&path, 256).unwrap();

    assert_eq!(fs::read(path).unwrap(), before);
}
