use crate::domain::{CropRegion, NormalizedLines};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum GeometryError {
    #[error("image dimensions must be positive")]
    EmptyImage,
    #[error("cut line must be between zero and one")]
    InvalidNormalizedLine,
    #[error("duplicate pixel boundary")]
    DuplicatePixelBoundary,
}

fn boundaries(size: u32, lines: &[f64]) -> Result<Vec<u32>, GeometryError> {
    if size == 0 {
        return Err(GeometryError::EmptyImage);
    }

    if lines
        .iter()
        .any(|line| !line.is_finite() || *line <= 0.0 || *line >= 1.0)
    {
        return Err(GeometryError::InvalidNormalizedLine);
    }

    let mut boundaries = Vec::with_capacity(lines.len() + 2);
    boundaries.push(0);
    boundaries.extend(
        lines
            .iter()
            .map(|line| (line * f64::from(size)).round() as u32),
    );
    boundaries.push(size);
    boundaries.sort_unstable();

    if boundaries.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(GeometryError::DuplicatePixelBoundary);
    }

    Ok(boundaries)
}

pub fn build_regions(
    width: u32,
    height: u32,
    lines: &NormalizedLines,
) -> Result<Vec<CropRegion>, GeometryError> {
    if width == 0 || height == 0 {
        return Err(GeometryError::EmptyImage);
    }

    let x_boundaries = boundaries(width, &lines.vertical)?;
    let y_boundaries = boundaries(height, &lines.horizontal)?;
    let columns = x_boundaries.len() - 1;
    let rows = y_boundaries.len() - 1;
    let mut regions = Vec::with_capacity(columns * rows);

    for y_pair in y_boundaries.windows(2) {
        for x_pair in x_boundaries.windows(2) {
            regions.push(CropRegion {
                index: regions.len() + 1,
                x: x_pair[0],
                y: y_pair[0],
                width: x_pair[1] - x_pair[0],
                height: y_pair[1] - y_pair[0],
            });
        }
    }

    Ok(regions)
}
