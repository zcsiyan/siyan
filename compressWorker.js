self.onmessage = async function(e) {
    const { imageData, quality, width, height, format } = e.data;
    
    try {
        // 创建图片对象
        const img = await createImageBitmap(imageData);
        
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
        const blob = await canvas.convertToBlob({
            type: format,
            quality: quality / 100
        });
        
        // 转换为base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = function() {
            self.postMessage({
                success: true,
                result: {
                    url: reader.result,
                    size: blob.size
                }
            });
        };
    } catch (error) {
        self.postMessage({
            success: false,
            error: error.message
        });
    }
}; 