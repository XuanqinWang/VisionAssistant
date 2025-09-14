"""
视觉助手后端API服务
"""
import io
import os
import base64
import logging
from datetime import datetime

import oss2
from flask import Flask, request, jsonify
from openai import OpenAI
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_cors import CORS
from PIL import Image

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建Flask应用
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)  # 信任代理头, 用于处理https访问开发环境服务
CORS(app)  # 允许跨域请求

class Aliyun_config:
    # 阿里云API配置
    ALIYUN_ACCESS_KEY_ID = 'REPLACEME'
    ALIYUN_ACCESS_KEY_SECRET = 'REPLACEME'

    # OSS配置
    OSS_ENDPOINT = 'oss-cn-shanghai.aliyuncs.com'
    OSS_BUCKET_NAME = 'default-xuanqin'
    OSS_DOMAIN = 'https://default-xuanqin.oss-cn-shanghai.aliyuncs.com'


aliyun_config = Aliyun_config()


client = OpenAI(
    api_key='replace',
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

system_prompt = """
你扮演Mino，你需要以Mino的身份和口吻用英文回答用户提出的问题，以下是关于Mino的介绍：
```
(请把你的介绍填写在这里，建议不少于500字)
```
"""


# 配置



class AiService:
    """图像识别服务"""

    @staticmethod
    def img_recognition(oss_url):
        """使用Aliyun API进行图像识别"""
        if not aliyun_config.ALIYUN_ACCESS_KEY_ID:
            raise Exception("未配置ALIYUN_ACCESS_KEY_ID环境变量")
        try:

            completion = client.chat.completions.create(
                model="qwen-vl-max-latest",
                # 此处以qwen-vl-max-latest为例，可按需更换模型名称。模型列表：https://help.aliyun.com/model-studio/getting-started/models
                messages=[
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": "You are a helpful assistant."}],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": oss_url
                                },
                            },
                            {"type": "text", "text": "请您用简单生动的语言描述图片中的内容，100字以内。"},
                        ],
                    },
                ],
            )

            # print(completion.choices[0].message.content)
            return completion.choices[0].message.content
        except Exception as e:
            logger.error(f"图像识别失败: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @staticmethod
    def talk_to_ai(text):
        try:
            completion = client.chat.completions.create(
                # 模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
                model="qwen-plus",
                # qwen-plus 属于 qwen3 模型，如需开启思考模式，请参见：https://help.aliyun.com/zh/model-studio/deep-thinking
                messages=[
                    {'role': 'system', 'content': system_prompt},  # system_prompt是全局变量，在上面定义
                    {'role': 'user', 'content': text}
                ]
            )
            print(completion.choices[0].message.content)
            return completion.choices[0].message.content
        except Exception as e:
            logger.error(f"AI对话失败: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500


class OssService:
    def __init__(self, aliyun_config):
        self.auth = oss2.Auth(aliyun_config.ALIYUN_ACCESS_KEY_ID, aliyun_config.ALIYUN_ACCESS_KEY_SECRET)
        self.bucket = oss2.Bucket(self.auth, aliyun_config.OSS_ENDPOINT, aliyun_config.OSS_BUCKET_NAME)

    def upload_base64_image(self, image_base64):
        """上传 base64 图片到 OSS 并返回访问链接"""
        object_key = OssService.generate_timestamp_key()
        try:
            # 解码 base64 图片数据
            image_data = base64.b64decode(image_base64)

            # 上传图片
            self.bucket.put_object(object_key, image_data)

            # 返回图片访问链接
            return f"{aliyun_config.OSS_DOMAIN}/{object_key}"
        except Exception as e:
            # 记录异常日志
            logger.error(f"OSS上传图片失败: {str(e)}")
            raise

    def compress_image_base64(image_base64, max_size=(1024, 1024), quality=85):
        """压缩 Base64 图片，限制最大尺寸和质量"""
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))

        # 缩放图片
        image.thumbnail(max_size)

        # 保存为 JPEG 压缩格式
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=quality)

        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    def generate_timestamp_key(extension=".jpg"):
        """使用时间戳生成 object_key"""
        now = datetime.now()
        return f"images/{now.strftime('%Y%m%d%H%M%S%f')}{extension}"


# API路由
@app.route('/api/recognize', methods=['POST'])
def recognize_image():
    """图像识别API端点"""
    try:
        # 获取请求数据
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({
                'success': False,
                'error': '缺少图像数据'
            }), 400

        image_base64 = data['image']

        # 验证base64数据
        try:
            base64.b64decode(image_base64)
        except Exception:
            return jsonify({
                'success': False,
                'error': '图像数据格式错误'
            }), 400

        # 压缩图片并上传OSS, 返回OSS图片链接
        compressed_image = OssService.compress_image_base64(image_base64)
        image_url = OssService(aliyun_config).upload_base64_image(compressed_image)

        # 图像识别
        try:
            if aliyun_config.ALIYUN_ACCESS_KEY_ID and aliyun_config.ALIYUN_ACCESS_KEY_SECRET:
                recognition_text = AiService.img_recognition(image_url)
                # recognition_text = 'hello world'
            else:
                raise Exception("未配置阿里云访问密钥")
        except Exception as e:
            logger.error(f"图像识别失败: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

        # 返回结果
        return jsonify({
            'success': True,
            'text': recognition_text
        })

    except Exception as e:
        logger.error(f"处理请求时发生错误: {e}")
        return jsonify({
            'success': False,
            'error': '服务器内部错误'
        }), 500


@app.route('/api/chat', methods=['GET'])
def chat():
    """对话API端点"""
    try:
        text = request.args.get('text')
        return AiService.talk_to_ai(text)
    except Exception as e:
        logger.error(f"处理请求时发生错误: {e}")
        return jsonify({
            'success': False,
            'error': '服务器内部错误'
        }), 500


@app.route('/', methods=['GET'])
def index():
    """根路径，返回API信息"""
    return jsonify({
        'name': '视觉助手API',
        'version': '1.0.0',
        'description': '为低视力人群提供图像识别和语音播报服务',
        'endpoints': {
            '/api/recognize': 'POST - 图像识别',
            '/api/health': 'GET - 健康检查'
        }
    })


if __name__ == '__main__':
    # 启动应用
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

