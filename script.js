// 视觉助手应用 - 主要JavaScript功能
class VisionAssistant {
    constructor() {
        // DOM元素引用
        this.elements = {
            video: document.getElementById('camera-video'),
            canvas: document.getElementById('capture-canvas'),
            capturedImageContainer: document.getElementById('captured-image-container'),
            capturedImage: document.getElementById('captured-image'),
            statusMessage: document.getElementById('status-message'),
            captureBtn: document.getElementById('capture-btn'),
            resetBtn: document.getElementById('reset-btn'),
            resultSection: document.getElementById('result-section'),
            resultText: document.getElementById('result-text'),
            playAudioBtn: document.getElementById('play-audio-btn'),
            resultAudio: document.getElementById('result-audio'),
            loadingIndicator: document.getElementById('loading-indicator'),
            errorMessage: document.getElementById('error-message'),
            errorText: document.getElementById('error-text'),
            dismissErrorBtn: document.getElementById('dismiss-error-btn'),
            speed1_5: document.getElementById('speed-1_5'),
            speed2: document.getElementById('speed-2')
        };

        // 状态管理
        this.state = {
            isProcessing: false,  // 是否正在处理
            isSpeaking: false,    // 是否正在说话
            currentAudioBlob: null, // 当前音频Blob
            currentUtterance: null, // 当前语音合成实例
            currentText: null       // 当前文本内容
        };

        // 配置
        this.config = {
            // 后端API地址 - 开发时使用localhost，部署时需要修改
//            apiBaseUrl: 'http://localhost:5000',
             apiBaseUrl: 'https://xuanqin.wang/app/',
            // 摄像头约束
            videoConstraints: {
                video: {
                    width: { ideal: 720 },
                    height: { ideal: 720 },
                    facingMode: 'environment' // 优先使用后置摄像头
                }
            }
        };

        this.init();
    }

    // 初始化应用
    async init() {
        try {
            this.bindEvents();
            await this.initCamera();
            this.updateStatus('摄像头已就绪 Camera is Ready');
        } catch (error) {
            console.error('初始化失败:', error);
            this.showError('应用初始化失败 Initializing failed: ' + error.message);
        }
    }

    // 绑定事件监听器
    bindEvents() {
        // 按钮点击事件
        this.elements.captureBtn.addEventListener('click', () => this.captureImage());
        this.elements.resetBtn.addEventListener('click', () => this.resetCapture());
        this.elements.playAudioBtn.addEventListener('click', () => this.playAudio());
        this.elements.dismissErrorBtn.addEventListener('click', () => this.hideError());


        // 键盘快捷键
        document.addEventListener('keydown', (event) => this.handleKeyboard(event));

        // 初始化音频播放器
        this.elements.resultAudio = document.getElementById('result-audio');
        if (this.elements.resultAudio) {
            // 音频播放结束事件
            this.elements.resultAudio.addEventListener('ended', () => {
                this.elements.playAudioBtn.textContent = '🔊 播放语音 Play';
            });
        } else {
            console.error('音频元素未找到，请检查 HTML 中是否存在 id 为 result-audio 的元素');
        }

        // 窗口大小变化时调整canvas
        window.addEventListener('resize', () => this.adjustCanvas());
    }

    // 初始化摄像头
    async initCamera() {
        try {
            this.updateStatus('正在启动摄像头 Initiating Camera...');
            
            // 请求摄像头权限
            this.state.stream = await navigator.mediaDevices.getUserMedia(this.config.videoConstraints);
            
            // 设置视频流
            this.elements.video.srcObject = this.state.stream;
            
            // 等待视频加载完成
            await new Promise((resolve) => {
                this.elements.video.addEventListener('loadedmetadata', resolve, { once: true });
            });

            // 调整canvas大小
            this.adjustCanvas();
            
            // 启用拍照按钮
            this.elements.captureBtn.disabled = false;
            
            this.updateStatus('摄像头已就绪 Camera is ready');
        } catch (error) {
            console.error('摄像头初始化失败:', error);
            let errorMessage = '无法访问摄像头 Cannot access camera';
            
            if (error.name === 'NotAllowedError') {
                errorMessage = '请允许访问摄像头权限 Camera permission not allowed';
            } else if (error.name === 'NotFoundError') {
                errorMessage = '未找到摄像头设备 Cannot find camera';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = '浏览器不支持摄像头功能 Browser does not support camera';
            }
            
            this.showError(errorMessage);
            throw error;
        }
    }

    // 调整canvas大小以匹配视频
    adjustCanvas() {
        if (this.elements.video.videoWidth && this.elements.video.videoHeight) {
            this.elements.canvas.width = this.elements.video.videoWidth;
            this.elements.canvas.height = this.elements.video.videoHeight;
        }
    }

    // 拍照功能
    async captureImage() {
        if (this.state.isProcessing) return;

        try {
            this.state.isProcessing = true;
            this.updateStatus('正在拍照...');
            
            // 调整canvas大小
            this.adjustCanvas();
            
            // 获取canvas上下文并绘制当前视频帧
            const context = this.elements.canvas.getContext('2d');
            context.drawImage(
                this.elements.video, 
                0, 0, 
                this.elements.canvas.width, 
                this.elements.canvas.height
            );
            
            // 将canvas转换为blob
            const imageBlob = await new Promise(resolve => {
                this.elements.canvas.toBlob(resolve, 'image/jpeg', 0.8);
            });
            
            // 显示拍摄的图像
            const imageUrl = URL.createObjectURL(imageBlob);
            this.elements.capturedImage.src = imageUrl;
            this.elements.capturedImage.alt = '识别中 Recognizing...';
            
            // 切换显示
            this.elements.video.style.display = 'none';
            this.elements.capturedImageContainer.style.display = 'block';
            this.elements.captureBtn.style.display = 'none';
            this.elements.resetBtn.style.display = 'inline-flex';
            
            // 转换为base64并发送到后端
            const base64Image = await this.blobToBase64(imageBlob);
            await this.recognizeImage(base64Image);
            
        } catch (error) {
            console.error('拍照失败 Failed:', error);
            this.showError('拍照失败 Failed: ' + error.message);
        } finally {
            this.state.isProcessing = false;
        }
    }

    // 重置拍照状态
    resetCapture() {
        // 停止当前语音
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        // 隐藏结果和错误
        this.elements.resultSection.style.display = 'none';
        this.hideError();
        
        // 重置显示状态
        this.elements.video.style.display = 'block';
        this.elements.capturedImageContainer.style.display = 'none';
        this.elements.captureBtn.style.display = 'inline-flex';
        this.elements.resetBtn.style.display = 'none';
        
        // 清理音频和语音状态
        this.state.currentAudioBlob = null;
        this.state.currentUtterance = null;
        this.state.currentText = null;
        this.elements.resultAudio.src = '';
        
        // 更新状态
        this.updateStatus('摄像头已就绪 Camera is Ready');
        
        // 清理图像URL以释放内存
        if (this.elements.capturedImage.src) {
            URL.revokeObjectURL(this.elements.capturedImage.src);
        }
    }

    // 图像识别
    async recognizeImage(base64Image) {
        try {
            this.showLoading('正在识别 Recognizing...');
            
            // 发送到后端API
            const response = await fetch(`${this.config.apiBaseUrl}/api/recognize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: base64Image
                })
            });
            
            if (!response.ok) {
                throw new Error(`服务器错误: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || '识别失败 Failed');
            }
            
            // 显示识别结果
            this.displayResult(result.text);
            
        } catch (error) {
            console.error('识别失败 Failed:', error);
            this.hideLoading();
            
            let errorMessage = '识别失败 Failed';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = '服务器错误 Server Failure';
            } else {
                errorMessage = error.message;
            }
            
            this.showError(errorMessage);
        }
    }

    // 显示识别结果
    displayResult(text) {
        this.hideLoading();
        
        // 显示文本结果
        this.elements.resultText.textContent = text;
        this.elements.resultText.setAttribute('aria-label', `识别结果: ${text}`);
        this.elements.resultSection.style.display = 'block';

        // 如果没有后端音频，使用Web Speech API
        this.speakWithWebAPI(text, 1.2);

        // 更新状态
        this.updateStatus('识别完成 Completed');
        
        // 滚动到结果区域
        this.elements.resultSection.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * 使用 Web Speech API 进行语音合成
     * @param {string} text 需要合成的文本
     * @param {number} [rate=1] 播放速度，默认1倍速
     * @throws {Error} 如果浏览器不支持 Web Speech API 或合成失败
     * @description 该方法会尝试使用 Web Speech API 合成语音，并处理播放速度、播放、暂停、错误等事件
     */
    speakWithWebAPI(text, rate = 1) {
        if ('speechSynthesis' in window) {
            try {
                // 停止当前语音
                if (speechSynthesis.speaking || speechSynthesis.pending) {
                    speechSynthesis.cancel();
                }

                // 释放旧的语音实例
                if (this.state.currentUtterance) {
                    this.state.currentUtterance.onstart = null;
                    this.state.currentUtterance.onend = null;
                    this.state.currentUtterance.onerror = null;
                    this.state.currentUtterance = null;
                }

                // 创建语音合成实例
                const utterance = new SpeechSynthesisUtterance(text);

                // 设置语言，优先使用英文以提高兼容性
                utterance.lang = 'en-US';
                if (speechSynthesis.getVoices().some(v => v.lang === 'zh-CN')) {
                    utterance.lang = 'zh-CN';
                }

                // 设置语音参数
                utterance.rate = rate; // 使用传入的播放速度
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                // 语音开始事件
                utterance.onstart = () => {
                    console.log('语音合成开始');
                    this.state.isSpeaking = true;
                    this.elements.playAudioBtn.innerHTML = '<span class="btn-icon">⏸️</span><span class="btn-text">暂停语音 Pause</span>';
                };

                // 语音结束事件
                utterance.onend = () => {
                    console.log('语音合成结束');
                    this.state.isSpeaking = false;
                    this.elements.playAudioBtn.innerHTML = '<span class="btn-icon">🔊</span><span class="btn-text">播放语音 Play</span>';
                };

                // 使用 setTimeout 延迟执行后续语音合成
                setTimeout(() => {
                    speechSynthesis.speak(utterance);
                    this.state.currentUtterance = utterance;
                    this.state.currentText = text;
                }, 100);

                return;

            } catch (error) {
                console.error('Web Speech API 失败:', error);
                this.showError('语音播放失败 Failed: ' + error.message);
                throw error;
            }
        } else {
            console.warn('浏览器不支持 Web Speech API');
            this.showError('语音播放功能不可用 Audio is not available');
            throw new Error('Browser does not support speech synthesis');
        }
    }

    // 播放音频
    async playAudio() {
        // 如果当前有语音正在播放，则停止
        if (this.state.isSpeaking) {
            if ('speechSynthesis' in window) {
                speechSynthesis.pause();
            }
            this.state.isSpeaking = false;
            this.elements.playAudioBtn.innerHTML = '<span class="btn-icon">🔊</span><span class="btn-text">播放语音 Play</span>';
            return;
        }

        // 停止当前正在播放的音频
       if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }

        // 如果没有后端音频但有文本，使用Web Speech API
        if (this.state.currentText) {
            // 添加播放速度参数，默认1.2倍速
            this.speakWithWebAPI(this.state.currentText, 1.2);
        }
        // 后端没有返回文本
        else {
            this.showError('没有可播放的内容 No content');
        }
    }


    // 工具函数：Blob转Base64
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // 移除data URL前缀
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // 工具函数：Base64转Blob
    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    // UI更新函数
    updateStatus(message) {
        this.elements.statusMessage.textContent = message;
        this.elements.statusMessage.setAttribute('aria-live', 'polite');
    }

    showLoading(message) {
        this.elements.loadingIndicator.style.display = 'flex';
        this.elements.loadingIndicator.querySelector('.loading-text').textContent = message;
    }

    hideLoading() {
        this.elements.loadingIndicator.style.display = 'none';
    }

    showError(message) {
        this.elements.errorText.textContent = message;
        this.elements.errorMessage.style.display = 'block';
        this.elements.errorMessage.setAttribute('aria-live', 'assertive');
        
        // 滚动到错误消息
        this.elements.errorMessage.scrollIntoView({ behavior: 'smooth' });
    }

    hideError() {
        this.elements.errorMessage.style.display = 'none';
    }

    // 清理资源
    cleanup() {
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => track.stop());
        }
        
        // 清理对象URL
        if (this.elements.capturedImage.src) {
            URL.revokeObjectURL(this.elements.capturedImage.src);
        }
        
        if (this.elements.resultAudio.src) {
            URL.revokeObjectURL(this.elements.resultAudio.src);
        }
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 检查浏览器兼容性
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('status-message').textContent = '您的浏览器不支持摄像头功能 Your browser does not support camera';
        document.getElementById('capture-btn').disabled = true;
        return;
    }

    // 初始化应用
    const app = new VisionAssistant();
    
    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});


window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的Promise拒绝:', event.reason);
});

function compressImage(file, maxSizeKB = 512) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                canvas.width = image.width * 0.5;
                canvas.height = image.height * 0.5;
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, { type: "image/jpeg" });
                    resolve(compressedFile);
                }, "image/jpeg", 0.7);
            };
            image.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// 假设这是你调用接口的函数
async function uploadImageToServer(file) {
    // 压缩图片
    const compressedFile = await compressImage(file);

    // 创建FormData对象并附加压缩后的文件
    const formData = new FormData();
    formData.append("file", compressedFile);

    // 调用接口上传图片
    const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
    });

    // 处理响应
    if (response.ok) {
        console.log("图片上传成功");
    } else {
        console.error("图片上传失败");
    }
}

