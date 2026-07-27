use crate::domain::NormalizedLines;
use crate::geometry::{build_regions, GeometryError};
use crate::image_probe::{apply_orientation, probe_image, read_exif_orientation, ProbeError};
use crate::naming::{available_output_path, default_output_directory, sanitize_filename};
use image::codecs::png::PngEncoder;
use image::{DynamicImage, ImageEncoder};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub source_path: PathBuf,
    pub output_directory: Option<PathBuf>,
    pub base_name: Option<String>,
    pub lines: NormalizedLines,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFile {
    pub index: usize,
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub lossless: bool,
}

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("could not probe source image: {source}")]
    Probe {
        #[source]
        source: ProbeError,
    },
    #[error("could not decode source image: {source}")]
    Decode {
        #[source]
        source: image::ImageError,
    },
    #[error("could not build crop geometry: {source}")]
    Geometry {
        #[source]
        source: GeometryError,
    },
    #[error("could not create output directory '{path}': {source}")]
    CreateDirectory {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("could not encode PNG crop '{path}': {source}")]
    Encode {
        path: PathBuf,
        #[source]
        source: image::ImageError,
    },
    #[error("could not write PNG crop '{path}': {source}")]
    Write {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("could not rename temporary crop '{from}' to '{to}': {source}")]
    Rename {
        from: PathBuf,
        to: PathBuf,
        #[source]
        source: io::Error,
    },
}

pub fn export_crops(request: &ExportRequest) -> Result<Vec<ExportedFile>, ExportError> {
    let source_info =
        probe_image(&request.source_path).map_err(|source| ExportError::Probe { source })?;
    let orientation = if source_info.format == "jpeg" {
        read_exif_orientation(&request.source_path).map_err(|source| ExportError::Probe {
            source: ProbeError::Exif { source },
        })?
    } else {
        None
    };
    let source =
        image::open(&request.source_path).map_err(|source| ExportError::Decode { source })?;
    let source = apply_orientation(source, orientation);
    let regions = build_regions(source.width(), source.height(), &request.lines)
        .map_err(|source| ExportError::Geometry { source })?;

    let output_directory = request
        .output_directory
        .clone()
        .unwrap_or_else(|| default_output_directory(&request.source_path));
    fs::create_dir_all(&output_directory).map_err(|source| ExportError::CreateDirectory {
        path: output_directory.clone(),
        source,
    })?;

    let base_name = request.base_name.clone().unwrap_or_else(|| {
        request
            .source_path
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
            .unwrap_or_else(|| "image".to_owned())
    });
    let base_name = sanitize_filename(&base_name);
    let mut exported = Vec::with_capacity(regions.len());

    for region in regions {
        let crop = source.crop_imm(region.x, region.y, region.width, region.height);
        let path = available_output_path(&output_directory, &base_name, region.index);
        write_png_atomic(&crop, &path)?;
        exported.push(ExportedFile {
            index: region.index,
            path,
            width: region.width,
            height: region.height,
            lossless: true,
        });
    }

    Ok(exported)
}

fn write_png_atomic(image: &DynamicImage, final_path: &Path) -> Result<(), ExportError> {
    let (temporary_path, file) = create_temporary_file(final_path)?;
    let mut temporary = TemporaryFile::new(temporary_path.clone());
    let mut writer = BufWriter::new(file);
    PngEncoder::new(&mut writer)
        .write_image(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .map_err(|source| ExportError::Encode {
            path: final_path.to_path_buf(),
            source,
        })?;
    writer.flush().map_err(|source| ExportError::Write {
        path: temporary_path.clone(),
        source,
    })?;
    writer
        .get_ref()
        .sync_all()
        .map_err(|source| ExportError::Write {
            path: temporary_path.clone(),
            source,
        })?;
    drop(writer);

    fs::rename(&temporary_path, final_path).map_err(|source| ExportError::Rename {
        from: temporary_path,
        to: final_path.to_path_buf(),
        source,
    })?;
    temporary.keep();
    Ok(())
}

fn create_temporary_file(final_path: &Path) -> Result<(PathBuf, File), ExportError> {
    let directory = final_path.parent().unwrap_or_else(|| Path::new("."));
    let final_name = final_path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    for attempt in 0_u32..1000 {
        let path = directory.join(format!(".{final_name}.{nonce}.{attempt}.tmp"));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(source) if source.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(source) => return Err(ExportError::Write { path, source }),
        }
    }

    let path = directory.join(format!(".{final_name}.{nonce}.tmp"));
    Err(ExportError::Write {
        path,
        source: io::Error::new(
            io::ErrorKind::AlreadyExists,
            "could not allocate a unique temporary filename",
        ),
    })
}

struct TemporaryFile {
    path: PathBuf,
    keep: bool,
}

impl TemporaryFile {
    fn new(path: PathBuf) -> Self {
        Self { path, keep: false }
    }

    fn keep(&mut self) {
        self.keep = true;
    }
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_file(&self.path);
        }
    }
}
