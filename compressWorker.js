self.onmessage = async function(e) {
    const { imageData, quality, width, height, format } = e.data;
    
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
        
        // 从Blob创建ImageBitmap
        const img = await createImageBitmap(blob);
        
        // 创建离屏canvas
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // 绘制图片
        if (format === 'image/png' || format === 'image/gif') {
            ctx.clearRect(0, 0, width, height);
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // 压缩图片
        const compressedBlob = await canvas.convertToBlob({
            type: format,
            quality: quality / 100
        });
        
        // 转换为base64
        const reader = new FileReader();
        reader.readAsDataURL(compressedBlob);
        reader.onloadend = function() {
            self.postMessage({
                success: true,
                result: {
                    url: reader.result,
                    size: compressedBlob.size
                }
            });
        };
    } catch (error) {
        console.error('Worker中压缩处理出错:', error);
        self.postMessage({
            success: false,
            error: error.message
        });
    }
}; 