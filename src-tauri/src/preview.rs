use crate::image_probe::{
    apply_orientation, format_name, read_exif_orientation, ExifOrientationError,
};
use image::{ImageFormat, ImageReader, Limits};
use std::io;
use std::path::Path;
use thiserror::Error;

const MIN_MAX_EDGE: u32 = 256;
const MAX_MAX_EDGE: u32 = 4096;
const MAX_SOURCE_EDGE: u32 = 16_384;
const MAX_SOURCE_PIXELS: u64 = 40_000_000;
const MAX_DECODE_ALLOC_BYTES: u64 = 192 * 1024 * 1024;

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
    #[error("source image {width}x{height} is too large for a safe preview")]
    SourceTooLarge { width: u32, height: u32 },
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
    let (source_width, source_height) = reader
        .into_dimensions()
        .map_err(|source| PreviewError::Decode { source })?;
    let source_pixels = u64::from(source_width) * u64::from(source_height);
    if source_width > MAX_SOURCE_EDGE
        || source_height > MAX_SOURCE_EDGE
        || source_pixels > MAX_SOURCE_PIXELS
    {
        return Err(PreviewError::SourceTooLarge {
            width: source_width,
            height: source_height,
        });
    }

    let orientation = if format == ImageFormat::Jpeg {
        read_exif_orientation(path).map_err(|source| PreviewError::Exif { source })?
    } else {
        None
    };

    let mut reader = ImageReader::open(path).map_err(|source| PreviewError::Open { source })?;
    reader.set_format(format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SOURCE_EDGE);
    limits.max_image_height = Some(MAX_SOURCE_EDGE);
    limits.max_alloc = Some(MAX_DECODE_ALLOC_BYTES);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|source| PreviewError::Decode { source })?;
    let image = if image.width() > max_edge || image.height() > max_edge {
        image.thumbnail(max_edge, max_edge)
    } else {
        image
    };
    let image = apply_orientation(image, orientation);
    let rgba = image.into_rgba8();

    Ok(PreviewResult {
        width: rgba.width(),
        height: rgba.height(),
        rgba: rgba.into_raw(),
    })
}
