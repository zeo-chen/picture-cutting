use crate::domain::ImageInfo;
use crate::export::{export_crops, ExportRequest, ExportedFile};
use crate::image_probe::probe_image;
use crate::preview::generate_preview;
use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ColorType, ImageEncoder};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDto {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn probe_images(paths: Vec<PathBuf>) -> Result<Vec<ImageInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|path| {
                probe_image(path)
                    .map_err(|error| format!("无法读取图片 {}：{error}", path.display()))
            })
            .collect()
    })
    .await
    .map_err(|error| format!("读取图片任务失败：{error}"))?
}

#[tauri::command]
pub async fn create_preview(path: PathBuf, max_edge: u32) -> Result<PreviewDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let preview =
            generate_preview(&path, max_edge).map_err(|error| format!("无法生成预览：{error}"))?;
        let mut png_bytes = Vec::new();
        PngEncoder::new(&mut png_bytes)
            .write_image(
                &preview.rgba,
                preview.width,
                preview.height,
                ColorType::Rgba8.into(),
            )
            .map_err(|error| format!("无法编码预览：{error}"))?;

        Ok(PreviewDto {
            data_url: format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(png_bytes)
            ),
            width: preview.width,
            height: preview.height,
        })
    })
    .await
    .map_err(|error| format!("生成预览任务失败：{error}"))?
}

#[tauri::command]
pub async fn export_image(request: ExportRequest) -> Result<Vec<ExportedFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_crops(&request).map_err(|error| format!("导出失败：{error}"))
    })
    .await
    .map_err(|error| format!("导出任务失败：{error}"))?
}
