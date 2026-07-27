use crate::domain::ImageInfo;
use exif::{In, Tag};
use image::{DynamicImage, ImageFormat, ImageReader};
use std::fs::File;
use std::io::{self, BufReader};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExifOrientationError {
    #[error("could not open the image while reading EXIF orientation: {source}")]
    Open {
        #[source]
        source: io::Error,
    },
    #[error("could not read JPEG EXIF orientation: {source}")]
    Read {
        #[source]
        source: io::Error,
    },
}

#[derive(Debug, Error)]
pub enum ProbeError {
    #[error("could not open image: {source}")]
    Open {
        #[source]
        source: io::Error,
    },
    #[error("could not detect image format: {source}")]
    FormatDetection {
        #[source]
        source: io::Error,
    },
    #[error("unsupported image format '{format}'; choose a supported PNG, JPEG, or WebP image")]
    UnsupportedFormat { format: String },
    #[error("could not read image dimensions: {source}")]
    Decode {
        #[source]
        source: image::ImageError,
    },
    #[error("could not inspect image orientation: {source}")]
    Exif {
        #[source]
        source: ExifOrientationError,
    },
}

pub fn probe_image(path: &Path) -> Result<ImageInfo, ProbeError> {
    let reader = ImageReader::open(path).map_err(|source| ProbeError::Open { source })?;
    let reader = reader
        .with_guessed_format()
        .map_err(|source| ProbeError::FormatDetection { source })?;
    let format = require_supported_format(reader.format())?;
    let (mut width, mut height) = reader
        .into_dimensions()
        .map_err(|source| ProbeError::Decode { source })?;

    let orientation = if format == ImageFormat::Jpeg {
        read_exif_orientation(path).map_err(|source| ProbeError::Exif { source })?
    } else {
        None
    };
    if matches!(orientation, Some(5..=8)) {
        std::mem::swap(&mut width, &mut height);
    }

    Ok(ImageInfo {
        path: path.to_path_buf(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
        width,
        height,
        format: format_name(format).to_owned(),
        orientation_applied: matches!(orientation, Some(2..=8)),
    })
}

pub fn read_exif_orientation(path: &Path) -> Result<Option<u16>, ExifOrientationError> {
    let file = File::open(path).map_err(|source| ExifOrientationError::Open { source })?;
    let mut reader = BufReader::new(file);
    let exif = match exif::Reader::new().read_from_container(&mut reader) {
        Ok(exif) => exif,
        Err(exif::Error::Io(source)) => return Err(ExifOrientationError::Read { source }),
        Err(_) => return Ok(None),
    };

    Ok(exif
        .get_field(Tag::Orientation, In::PRIMARY)
        .and_then(|field| field.value.get_uint(0))
        .and_then(|value| u16::try_from(value).ok())
        .filter(|orientation| (1..=8).contains(orientation)))
}

pub(crate) fn require_supported_format(
    format: Option<ImageFormat>,
) -> Result<ImageFormat, ProbeError> {
    match format {
        Some(format @ (ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP)) => Ok(format),
        Some(format) => Err(ProbeError::UnsupportedFormat {
            format: format_name(format).to_owned(),
        }),
        None => Err(ProbeError::UnsupportedFormat {
            format: "unknown".to_owned(),
        }),
    }
}

pub(crate) fn apply_orientation(image: DynamicImage, orientation: Option<u16>) -> DynamicImage {
    match orientation {
        Some(2) => image.fliph(),
        Some(3) => image.rotate180(),
        Some(4) => image.flipv(),
        Some(5) => image.fliph().rotate270(),
        Some(6) => image.rotate90(),
        Some(7) => image.fliph().rotate90(),
        Some(8) => image.rotate270(),
        _ => image,
    }
}

pub(crate) fn format_name(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpeg",
        ImageFormat::WebP => "webp",
        ImageFormat::Gif => "gif",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Ico => "ico",
        ImageFormat::Tiff => "tiff",
        ImageFormat::Avif => "avif",
        ImageFormat::Pnm => "pnm",
        ImageFormat::Tga => "tga",
        ImageFormat::Dds => "dds",
        ImageFormat::Farbfeld => "farbfeld",
        ImageFormat::OpenExr => "openexr",
        ImageFormat::Qoi => "qoi",
        ImageFormat::Pcx => "pcx",
        _ => "other",
    }
}
