#[allow(dead_code)]
mod common;

use image::{DynamicImage, GenericImageView, ImageBuffer, Rgba};
use picture_cutting_lib::domain::NormalizedLines;
use picture_cutting_lib::export::{export_crops, ExportError, ExportRequest};
use std::fs;
use std::path::Path;

fn request(source_path: &Path, lines: NormalizedLines) -> ExportRequest {
    ExportRequest {
        source_path: source_path.to_path_buf(),
        output_directory: None,
        base_name: None,
        lines,
    }
}

fn vertical_split() -> NormalizedLines {
    NormalizedLines {
        vertical: vec![0.5],
        horizontal: vec![],
    }
}

#[test]
fn exports_odd_width_rgba_crops_that_reconstruct_the_oriented_source_exactly() {
    let directory = tempfile::tempdir().unwrap();
    let source_path = common::patterned_png(directory.path());

    let files = export_crops(&request(&source_path, vertical_split())).unwrap();

    assert_eq!(files.len(), 2);
    assert_eq!((files[0].width, files[0].height), (3, 3));
    assert_eq!((files[1].width, files[1].height), (2, 3));
    assert!(files.iter().all(|file| file.lossless));

    let source = image::open(&source_path).unwrap().into_rgba8();
    let mut reconstructed = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(5, 3);
    let mut x = 0;
    for file in &files {
        let crop = image::open(&file.path).unwrap().into_rgba8();
        for (crop_x, y, pixel) in crop.enumerate_pixels() {
            reconstructed.put_pixel(x + crop_x, y, *pixel);
        }
        x += crop.width();
    }

    assert_eq!(reconstructed.into_raw(), source.into_raw());
}

#[test]
fn applies_the_preview_exif_orientation_before_cropping() {
    let directory = tempfile::tempdir().unwrap();
    let source_path = common::oriented_jpeg(directory.path(), 6);
    let output = directory.path().join("output");
    let request = ExportRequest {
        source_path: source_path.clone(),
        output_directory: Some(output),
        base_name: None,
        lines: NormalizedLines {
            vertical: vec![0.5],
            horizontal: vec![],
        },
    };

    let files = export_crops(&request).unwrap();

    assert_eq!((files[0].width, files[0].height), (10, 40));
    assert_eq!((files[1].width, files[1].height), (10, 40));
    let expected = picture_cutting_lib::preview::generate_preview(&source_path, 256)
        .unwrap()
        .rgba;
    let mut reconstructed = Vec::with_capacity(expected.len());
    let left = image::open(&files[0].path).unwrap().into_rgba8();
    let right = image::open(&files[1].path).unwrap().into_rgba8();
    for y in 0..40 {
        reconstructed.extend_from_slice(left.view(0, y, 10, 1).to_image().as_raw());
        reconstructed.extend_from_slice(right.view(0, y, 10, 1).to_image().as_raw());
    }
    assert_eq!(reconstructed, expected);
}

#[test]
fn uses_chinese_default_directory_and_basename() {
    let directory = tempfile::tempdir().unwrap();
    let source_path = directory.path().join("正面款.png");
    common::patterned_png(directory.path());
    fs::rename(directory.path().join("pattern.png"), &source_path).unwrap();

    let files = export_crops(&request(
        &source_path,
        NormalizedLines {
            vertical: vec![],
            horizontal: vec![],
        },
    ))
    .unwrap();

    assert_eq!(
        files[0].path,
        directory.path().join("正面款_切图/正面款_01.png")
    );
}

#[test]
fn sanitizes_invalid_filename_characters_and_never_overwrites_collisions() {
    let directory = tempfile::tempdir().unwrap();
    let source_path = common::patterned_png(directory.path());
    let output = directory.path().join("output");
    fs::create_dir(&output).unwrap();
    fs::write(output.join("正_面_01.png"), b"existing").unwrap();
    let request = ExportRequest {
        source_path,
        output_directory: Some(output.clone()),
        base_name: Some("正:面".to_owned()),
        lines: NormalizedLines {
            vertical: vec![],
            horizontal: vec![],
        },
    };

    let first = export_crops(&request).unwrap();
    let second = export_crops(&request).unwrap();

    assert_eq!(first[0].path, output.join("正_面_01_2.png"));
    assert_eq!(second[0].path, output.join("正_面_01_3.png"));
    assert_eq!(fs::read(output.join("正_面_01.png")).unwrap(), b"existing");
}

#[test]
fn returns_typed_geometry_error_for_invalid_lines() {
    let directory = tempfile::tempdir().unwrap();
    let source_path = common::patterned_png(directory.path());
    let error = export_crops(&request(
        &source_path,
        NormalizedLines {
            vertical: vec![0.0],
            horizontal: vec![],
        },
    ))
    .unwrap_err();

    assert!(matches!(error, ExportError::Geometry { .. }));
}

#[test]
fn leaves_no_temporary_files_after_success() {
    let directory = tempfile::tempdir().unwrap();
    let source_path = common::patterned_png(directory.path());
    let output = directory.path().join("output");
    let request = ExportRequest {
        source_path,
        output_directory: Some(output.clone()),
        base_name: None,
        lines: vertical_split(),
    };

    export_crops(&request).unwrap();

    let names: Vec<_> = fs::read_dir(output)
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    assert!(names
        .iter()
        .all(|name| !name.to_string_lossy().contains(".tmp")));
}

#[test]
fn preserves_source_color_type_samples_for_grayscale_png() {
    let directory = tempfile::tempdir().unwrap();
    let source_path = directory.path().join("gray.png");
    let source = image::GrayImage::from_raw(5, 3, (0..15).collect()).unwrap();
    DynamicImage::ImageLuma8(source.clone())
        .save(&source_path)
        .unwrap();

    let files = export_crops(&request(&source_path, vertical_split())).unwrap();

    assert_eq!(
        image::open(&files[0].path).unwrap().color(),
        image::ColorType::L8
    );
    let left = image::open(&files[0].path).unwrap().into_luma8();
    let right = image::open(&files[1].path).unwrap().into_luma8();
    let mut bytes = Vec::new();
    for y in 0..3 {
        bytes.extend_from_slice(left.view(0, y, 3, 1).to_image().as_raw());
        bytes.extend_from_slice(right.view(0, y, 2, 1).to_image().as_raw());
    }
    assert_eq!(bytes, source.into_raw());
}
