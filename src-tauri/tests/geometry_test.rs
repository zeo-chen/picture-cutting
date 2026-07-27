use picture_cutting_lib::domain::{CropRegion, NormalizedLines};
use picture_cutting_lib::geometry::{build_regions, GeometryError};

fn lines(vertical: &[f64], horizontal: &[f64]) -> NormalizedLines {
    NormalizedLines {
        vertical: vertical.to_vec(),
        horizontal: horizontal.to_vec(),
    }
}

#[test]
fn splits_even_image_into_four_exact_row_major_regions() {
    let regions = build_regions(3840, 2160, &lines(&[0.5], &[0.5])).unwrap();

    assert_eq!(
        regions,
        vec![
            CropRegion {
                index: 1,
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            CropRegion {
                index: 2,
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
            CropRegion {
                index: 3,
                x: 0,
                y: 1080,
                width: 1920,
                height: 1080,
            },
            CropRegion {
                index: 4,
                x: 1920,
                y: 1080,
                width: 1920,
                height: 1080,
            },
        ]
    );
    assert_eq!(total_area(&regions), 3840_u64 * 2160);
}

#[test]
fn rounds_odd_image_boundary_and_preserves_exact_coverage() {
    let regions = build_regions(5, 3, &lines(&[0.5], &[])).unwrap();

    assert_eq!(
        regions,
        vec![
            CropRegion {
                index: 1,
                x: 0,
                y: 0,
                width: 3,
                height: 3,
            },
            CropRegion {
                index: 2,
                x: 3,
                y: 0,
                width: 2,
                height: 3,
            },
        ]
    );
    assert_eq!(total_area(&regions), 15);
}

#[test]
fn orders_multiple_lines_left_to_right_then_top_to_bottom() {
    let regions = build_regions(12, 10, &lines(&[0.25, 0.75], &[0.4, 0.8])).unwrap();
    let positions: Vec<_> = regions
        .iter()
        .map(|region| (region.index, region.x, region.y))
        .collect();

    assert_eq!(
        positions,
        vec![
            (1, 0, 0),
            (2, 3, 0),
            (3, 9, 0),
            (4, 0, 4),
            (5, 3, 4),
            (6, 9, 4),
            (7, 0, 8),
            (8, 3, 8),
            (9, 9, 8),
        ]
    );
}

#[test]
fn rejects_distinct_lines_that_round_to_duplicate_pixel_boundary() {
    let error = build_regions(2, 10, &lines(&[0.49, 0.51], &[])).unwrap_err();

    assert_eq!(error, GeometryError::DuplicatePixelBoundary);
    assert!(error.to_string().contains("duplicate pixel boundary"));
}

#[test]
fn rejects_zero_width_or_height() {
    assert_eq!(
        build_regions(0, 10, &lines(&[], &[])),
        Err(GeometryError::EmptyImage)
    );
    assert_eq!(
        build_regions(10, 0, &lines(&[], &[])),
        Err(GeometryError::EmptyImage)
    );
}

#[test]
fn rejects_lines_outside_open_normalized_interval() {
    for invalid in [
        -0.1,
        0.0,
        1.0,
        1.1,
        f64::NAN,
        f64::INFINITY,
        f64::NEG_INFINITY,
    ] {
        assert_eq!(
            build_regions(100, 100, &lines(&[invalid], &[])),
            Err(GeometryError::InvalidNormalizedLine),
            "vertical line {invalid:?} should be rejected"
        );
        assert_eq!(
            build_regions(100, 100, &lines(&[], &[invalid])),
            Err(GeometryError::InvalidNormalizedLine),
            "horizontal line {invalid:?} should be rejected"
        );
    }
}

#[test]
fn accepts_unsorted_lines_and_sorts_pixel_boundaries() {
    let regions = build_regions(10, 8, &lines(&[0.8, 0.2, 0.5], &[0.75, 0.25])).unwrap();

    let expected = [
        (0, 0, 2, 2),
        (2, 0, 3, 2),
        (5, 0, 3, 2),
        (8, 0, 2, 2),
        (0, 2, 2, 4),
        (2, 2, 3, 4),
        (5, 2, 3, 4),
        (8, 2, 2, 4),
        (0, 6, 2, 2),
        (2, 6, 3, 2),
        (5, 6, 3, 2),
        (8, 6, 2, 2),
    ];
    let actual: Vec<_> = regions
        .iter()
        .map(|region| (region.x, region.y, region.width, region.height))
        .collect();
    assert_eq!(actual, expected);
}

#[test]
fn regions_are_positive_bounded_and_tile_without_gaps_or_overlaps() {
    let width = 17;
    let height = 13;
    let regions = build_regions(
        width,
        height,
        &lines(&[0.12, 0.38, 0.67, 0.91], &[0.21, 0.49, 0.82]),
    )
    .unwrap();

    assert!(regions.iter().all(|region| {
        region.width > 0
            && region.height > 0
            && region.x + region.width <= width
            && region.y + region.height <= height
    }));
    assert_eq!(total_area(&regions), u64::from(width) * u64::from(height));

    for y in 0..height {
        for x in 0..width {
            let covering_regions = regions
                .iter()
                .filter(|region| {
                    x >= region.x
                        && x < region.x + region.width
                        && y >= region.y
                        && y < region.y + region.height
                })
                .count();
            assert_eq!(covering_regions, 1, "pixel ({x}, {y}) must be covered once");
        }
    }
}

fn total_area(regions: &[CropRegion]) -> u64 {
    regions
        .iter()
        .map(|region| u64::from(region.width) * u64::from(region.height))
        .sum()
}
