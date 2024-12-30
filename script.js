let compressionWorkers = [];
const MAX_WORKERS = navigator.hardwareConcurrency || 4;

// 将这些DOM元素声明为全局变量
let widthInput, heightInput, maintainRatio, outputFormat, qualitySlider;

// 添加支持的图片格式配置到全局作用域
const supportedFormats = {
    'image/jpeg': {
        extension: 'jpg',
        mimeType: 'image/jpeg',
        qualitySupport: true,
        description: '适合照片，体积小'
    },
    'image/png': {
        extension: 'png',
        mimeType: 'image/png',
        qualitySupport: false,
        description: '支持透明背景，无损压缩'
    },
    'image/webp': {
        extension: 'webp',
        mimeType: 'image/webp',
        qualitySupport: true,
        description: '更高压缩率，新一代格式'
    },
    'image/gif': {
        extension: 'gif',
        mimeType: 'image/gif',
        qualitySupport: false,
        description: '支持动画，适合简单图像'
    },
    'image/bmp': {
        extension: 'bmp',
        mimeType: 'image/bmp',
        qualitySupport: false,
        description: '无压缩，完整保真'
    },
    'image/tiff': {
        extension: 'tiff',
        mimeType: 'image/tiff',
        qualitySupport: true,
        description: '专业图像，支持多页面'
    }
};

// 创建 Worker 的函数
function initializeWorkers() {
    try {
        for (let i = 0; i < MAX_WORKERS; i++) {
            const worker = new Worker('compressWorker.js');
            worker.busy = false;
            compressionWorkers.push(worker);
        }
        return true;
    } catch (error) {
        console.warn('Web Worker 初始化失败，将使用主线程处理:', error);
        return false;
    }
}

// 修改降级处理的压缩函数
async function compressInMainThread(imageData, quality, width, height, format) {
    try {
        // 将base64转换为Blob
        const base64Data = imageData.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: format });
        
        // 创建图片对象
        const img = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = width;
        canvas.height = height;
        
        if (format === 'image/png' || format === 'image/gif') {
            ctx.clearRect(0, 0, width, height);
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL(format, quality / 100);
        const size = Math.round((dataUrl.length - 22) * 3 / 4);
        
        return {
            success: true,
            result: {
                url: dataUrl,
                size: size
            }
        };
    } catch (error) {
        console.error('压缩处理出错:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// 修改 compressImageFile 函数
async function compressImageFile(file) {
    if (!widthInput || !heightInput || !maintainRatio || !outputFormat || !qualitySlider) {
        throw new Error('DOM元素未初始化');
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const img = new Image();
            img.onload = async function() {
                let width = parseInt(widthInput.value);
                let height = parseInt(heightInput.value);
                
                if (maintainRatio.checked) {
                    const ratio = img.width / img.height;
                    if (width / height > ratio) {
                        width = height * ratio;
                    } else {
                        height = width / ratio;
                    }
                }

                try {
                    let result;
                    if (compressionWorkers.length > 0) {
                        // 使用 Worker 处理
                        const worker = compressionWorkers.find(w => !w.busy);
                        if (worker) {
                            worker.busy = true;
                            worker.onmessage = function(e) {
                                worker.busy = false;
                                if (e.data.success) {
                                    resolve({
                                        url: e.data.result.url,
                                        size: e.data.result.size,
                                        extension: supportedFormats[outputFormat.value].extension,
                                        mimeType: outputFormat.value
                                    });
                                } else {
                                    console.error('Worker返回错误:', e.data.error);
                                    reject(new Error(e.data.error));
                                }
                            };
                            
                            worker.onerror = function(error) {
                                worker.busy = false;
                                console.error('Worker错误:', error);
                                reject(error);
                            };

                            // 发送数据到worker
                            worker.postMessage({
                                imageData: e.target.result,
                                quality: qualitySlider.value,
                                width: width,
                                height: height,
                                format: outputFormat.value
                            });
                        } else {
                            // 所有 Worker 都忙，使用主线程
                            result = await compressInMainThread(e.target.result, qualitySlider.value, width, height, outputFormat.value);
                        }
                    } else {
                        // 没有 Worker 可用，使用主线程
                        result = await compressInMainThread(e.target.result, qualitySlider.value, width, height, outputFormat.value);
                    }

                    if (result) {
                        if (result.success) {
                            resolve({
                                url: result.result.url,
                                size: result.result.size,
                                extension: supportedFormats[outputFormat.value].extension,
                                mimeType: outputFormat.value
                            });
                        } else {
                            reject(new Error(result.error));
                        }
                    }
                } catch (error) {
                    reject(error);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // 初始化DOM元素引用
    widthInput = document.getElementById('width');
    heightInput = document.getElementById('height');
    maintainRatio = document.getElementById('maintainRatio');
    outputFormat = document.getElementById('outputFormat');
    qualitySlider = document.getElementById('quality');
    
    const imageInput = document.getElementById('imageInput');
    const qualityValue = document.getElementById('qualityValue');
    const imagesList = document.querySelector('.images-list');
    const compressAllBtn = document.getElementById('compressAllBtn');
    const downloadAllBtn = document.getElementById('downloadAllBtn');

    let images = [];

    // 更新质量显示
    qualitySlider.addEventListener('input', function() {
        qualityValue.textContent = this.value;
    });

    // 监听文件选择
    imageInput.addEventListener('change', handleFiles);
    
    // 拖拽功能
    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleFiles({ target: { files: e.dataTransfer.files } });
    });

    function handleFiles(e) {
        const supportedTypes = Object.keys(supportedFormats);
        const files = Array.from(e.target.files).filter(file => {
            const isSupported = supportedTypes.includes(file.type);
            if (!isSupported) {
                console.warn(`不支持的文件类型: ${file.type}`);
            }
            return isSupported;
        });

        if (files.length === 0) {
            alert('请选择支持的图片格式文件：JPG, PNG, WebP, GIF, BMP, TIFF');
            return;
        }

        images = images.concat(files.map(file => ({
            file,
            id: Date.now() + Math.random(),
            status: 'pending',
            compressed: null,
            originalFormat: file.type
        })));

        updateImagesList();
        compressAllBtn.disabled = false;
    }

    function updateImagesList() {
        imagesList.innerHTML = images.map(image => `
            <div class="image-item" data-id="${image.id}">
                <img src="${image.preview || '#'}" class="image-preview-small" 
                     alt="预览" 
                     loading="lazy"
                     width="100" 
                     height="100">
                <div class="image-info">
                    <div class="image-name">${image.file.name}</div>
                    <div class="image-status">
                        原始大小: ${(image.file.size / 1024).toFixed(2)} KB
                        ${image.compressed && image.compressed.size ? `<br>压缩后: ${(image.compressed.size / 1024).toFixed(2)} KB` : ''}
                    </div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: ${image.status === 'completed' ? '100%' : '0'}"></div>
                    </div>
                </div>
                <div class="image-actions">
                    <button class="action-button" data-action="compress" data-id="${image.id}"
                        ${image.status === 'completed' ? 'disabled' : ''}>
                        ${image.status === 'completed' ? '已压缩' : '压缩'}
                    </button>
                    ${image.compressed && image.compressed.url ? `
                        <button class="action-button" data-action="download" data-id="${image.id}">下载</button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // 添加事件监听器
        const buttons = imagesList.querySelectorAll('button[data-action]');
        buttons.forEach(button => {
            button.addEventListener('click', function() {
                const action = this.dataset.action;
                const id = parseFloat(this.dataset.id);
                if (action === 'compress') {
                    compressImage(id);
                } else if (action === 'download') {
                    downloadImage(id);
                }
            });
        });

        // 优化预览图生成
        images.forEach(image => {
            if (!image.preview) {
                createImagePreview(image);
            }
        });
    }

    // 新增：优化预览图生成函数
    function createImagePreview(image) {
        const reader = new FileReader();
        reader.onload = function(e) {
            // 创建一个较小的预览图
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // 设置预览图大小为100x100
                canvas.width = 100;
                canvas.height = 100;
                
                // 计算裁剪区域，保持比例
                const size = Math.min(img.width, img.height);
                const startX = (img.width - size) / 2;
                const startY = (img.height - size) / 2;
                
                ctx.drawImage(img, startX, startY, size, size, 0, 0, 100, 100);
                image.preview = canvas.toDataURL('image/jpeg', 0.6);
                updateImagesList();
            };
            img.src = e.target.result;
        };
        // 使用readAsDataURL而不是整个文件
        const blob = new Blob([image.file], { type: image.file.type });
        reader.readAsDataURL(blob);
    }

    // 压缩单张图片
    window.compressImage = async function(id) {
        try {
            const image = images.find(img => Math.abs(img.id - id) < Number.EPSILON);
            if (!image) return;

            // 更新UI状态
            const progressBar = document.querySelector(`[data-id="${id}"] .progress-bar-fill`);
            if (progressBar) progressBar.style.width = '50%';

            // 使用 requestAnimationFrame 延迟压缩操作，避免UI阻塞
            await new Promise(resolve => requestAnimationFrame(resolve));

            const result = await compressImageFile(image.file);
            if (!result || !result.url) throw new Error('压缩失败');

            // 使用 requestAnimationFrame 更新UI
            requestAnimationFrame(() => {
                image.compressed = result;
                image.status = 'completed';
                if (progressBar) progressBar.style.width = '100%';
                updateImagesList();
                checkAllCompleted();
            });

        } catch (error) {
            console.error('压缩图片时出错:', error);
            throw error;
        }
    };

    // 修改批量压缩功能
    compressAllBtn.addEventListener('click', async function() {
        try {
            this.disabled = true;
            const totalImages = images.filter(img => img.status !== 'completed').length;
            let processed = 0;
            
            // 更新进度条初始状态
            updateCompressionProgress(0);
            
            // 获取待压缩图片
            const pendingImages = images.filter(img => img.status !== 'completed');
            
            // 并行处理图片
            await Promise.all(pendingImages.map(async (image) => {
                try {
                    await compressImage(image.id);
                    processed++;
                    const progress = (processed / totalImages) * 100;
                    updateCompressionProgress(progress);
                } catch (error) {
                    console.error('压缩失败:', error);
                }
            }));
            
        } catch (error) {
            console.error('批量压缩出错:', error);
            alert('批量压缩时出现错误，请重试');
        } finally {
            this.disabled = false;
            checkAllCompleted();
        }
    });

    // 优化压缩进度更新
    function updateCompressionProgress(progress) {
        requestAnimationFrame(() => {
            const progressBar = document.querySelector('.batch-progress');
            if (!progressBar) {
                const batchActions = document.querySelector('.batch-actions');
                const progressElement = document.createElement('div');
                progressElement.className = 'batch-progress';
                progressElement.innerHTML = `
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="progress-text">${Math.round(progress)}%</div>
                `;
                batchActions.appendChild(progressElement);
            } else {
                progressBar.querySelector('.progress-bar-fill').style.width = `${progress}%`;
                progressBar.querySelector('.progress-text').textContent = `${Math.round(progress)}%`;
            }
        });
    }

    // 检查浏览器是否支持 WebP
    function checkWebPSupport() {
        const canvas = document.createElement('canvas');
        if (canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0) {
            return true;
        }
        // 如果不支持 WebP，移除该选项
        const webpOption = outputFormat.querySelector('option[value="image/webp"]');
        if (webpOption) {
            webpOption.remove();
        }
        return false;
    }
    checkWebPSupport();

    // 修改下载单张图片函数
    window.downloadImage = async function(id) {
        try {
            const image = images.find(img => Math.abs(img.id - id) < Number.EPSILON);
            if (!image) {
                console.error('找不到图片');
                return;
            }

            if (!image.compressed || !image.compressed.url) {
                console.error('图片未压缩或压缩数据不完整');
                alert('请先压缩图片');
                return;
            }

            // 直接从base64 URL创建Blob对象
            const base64Data = image.compressed.url.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: image.compressed.mimeType });

            // 创建下载链接
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            
            // 设置文件名
            const extension = image.compressed.extension;
            const fileName = image.file.name.replace(/\.[^/.]+$/, '') + '_compressed.' + extension;
            link.download = fileName;
            
            // 触发下载
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 清理 URL 对象
            setTimeout(() => {
                URL.revokeObjectURL(downloadUrl);
            }, 1000);

        } catch (error) {
            console.error('下载图片时出错:', error);
            alert('下载图片时出现错误，请重试');
        }
    };

    // 修改打包下载函数
    downloadAllBtn.addEventListener('click', async function() {
        try {
            // 禁用按钮，防止重复点击
            this.disabled = true;
            
            // 创建新的 JSZip 实例
            const zip = new JSZip();
            
            // 添加所有压缩后的图片到 zip
            for (const image of images) {
                if (image.compressed && image.compressed.url) {
                    // 从 base64 URL 中提取数据
                    const base64Data = image.compressed.url.split(',')[1];
                    const extension = image.compressed.extension;
                    const fileName = image.file.name.replace(/\.[^/.]+$/, '') + '_compressed.' + extension;
                    
                    // 添加文件到 zip
                    zip.file(fileName, base64Data, {base64: true});
                }
            }

            // 生成 zip 文件
            const content = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: {
                    level: 9
                }
            });

            // 创建下载链接
            const downloadUrl = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = "compressed_images.zip";
            
            // 触发下载
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 清理 URL 对象
            setTimeout(() => {
                URL.revokeObjectURL(downloadUrl);
            }, 1000);

        } catch (error) {
            console.error('打包下载出错:', error);
            alert('打包下载时出现错误，请重试');
        } finally {
            // 重新启用按钮
            this.disabled = false;
        }
    });

    function checkAllCompleted() {
        const allCompleted = images.every(img => img.status === 'completed');
        downloadAllBtn.disabled = !allCompleted;
    }

    // 检查浏览器对各种格式的支持
    function checkFormatSupport() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const formatSelect = document.getElementById('outputFormat');
        
        Object.keys(supportedFormats).forEach(format => {
            const isSupported = canvas.toDataURL(format).indexOf(`data:${format}`) === 0;
            if (!isSupported) {
                const option = formatSelect.querySelector(`option[value="${format}"]`);
                if (option) {
                    option.disabled = true;
                    option.text += ' (浏览器不支持)';
                }
            }
        });
    }

    checkFormatSupport();

    // 尝试初始化 Workers
    const workersInitialized = initializeWorkers();
    if (!workersInitialized) {
        console.log('将使用主线程进行图片压缩');
    }
}); 