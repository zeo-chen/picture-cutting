use crate::image_probe::{
    apply_orientation, format_name, read_exif_orientation, ExifOrientationError,
};
use image::{ImageFormat, ImageReader};
use std::io;
use std::path::Path;
use thiserror::Error;

const MIN_MAX_EDGE: u32 = 256;
const MAX_MAX_EDGE: u32 = 4096;

#[derive(Debug)]
pub struct PreviewResult {
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Error)]
pub enum PreviewError {
    #[error("preview max edge must be 256 through 4096 pixels, got {value}")]
    InvalidMaxEdge { value: u32 },
    #[error("could not open image for preview: {source}")]
    Open {
        #[source]
        source: io::Error,
    },
    #[error("could not detect preview image format: {source}")]
    FormatDetection {
        #[source]
        source: io::Error,
    },
    #[error("unsupported image format '{format}'; choose a supported PNG, JPEG, or WebP image")]
    UnsupportedFormat { format: String },
    #[error("could not decode image preview: {source}")]
    Decode {
        #[source]
        source: image::ImageError,
    },
    #[error("could not inspect preview image orientation: {source}")]
    Exif {
        #[source]
        source: ExifOrientationError,
    },
}

pub fn generate_preview(path: &Path, max_edge: u32) -> Result<PreviewResult, PreviewError> {
    if !(MIN_MAX_EDGE..=MAX_MAX_EDGE).contains(&max_edge) {
        return Err(PreviewError::InvalidMaxEdge { value: max_edge });
    }

    let reader = ImageReader::open(path).map_err(|source| PreviewError::Open { source })?;
    let reader = reader
        .with_guessed_format()
        .map_err(|source| PreviewError::FormatDetection { source })?;
    let format = match reader.format() {
        Some(format @ (ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP)) => format,
        Some(format) => {
            return Err(PreviewError::UnsupportedFormat {
                format: format_name(format).to_owned(),
            })
        }
        None => {
            return Err(PreviewError::UnsupportedFormat {
                format: "unknown".to_owned(),
            })
        }
    };
    let orientation = if format == ImageFormat::Jpeg {
        read_exif_orientation(path).map_err(|source| PreviewError::Exif { source })?
    } else {
        None
    };
    let image = reader
        .decode()
        .map_err(|source| PreviewError::Decode { source })?;
    let image = apply_orientation(image, orientation);
    let image = if image.width() > max_edge || image.height() > max_edge {
        image.thumbnail(max_edge, max_edge)
    } else {
        image
    };
    let rgba = image.into_rgba8();

    Ok(PreviewResult {
        width: rgba.width(),
        height: rgba.height(),
        rgba: rgba.into_raw(),
    })
}
