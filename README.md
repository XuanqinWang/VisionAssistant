# VisionAssistant
Vision Assistant (I name it OIC - Oh! I See) is a web based app programed by Python and HTML/Javascript. 
It could help low vision users to capture a picture and understand what described in the scene via voice from smart phone. 

It uses Ali cloud based AI LLM service to recognize and smartly describe pictures. It has 2 parts of files

Backend - purely use Python to create a serve service for frontend to call, it will call cloud picture recoginition API to generate a description text. 

Frontend - a simple interactive UX to initial client-end phone camera to capture a picture, coding the picture data and call backend service, once receiving AI described text, it will convert it to voice and play. 

Note - curretnly the recoginized description only supports Chinese, and the voice will be in Chinses as well. 

# Try My Demo
I deployed this app to my personal cloud server and created an URL for demostration. If you are interested, please try via below URL:
http://xuanqin.wang/app/vision-assistant/

you could check this video (http://xuanqin.wang/VisionAssistant/OICdemo.mp4) to 'install' my app to your iPhone desktop and experience the functions. 

If you run it from your mobile phone, please use web brower app to open like Chrome or Safari. 
Don't run it too many times, it'll brankrupt me, thanks!


# Contact
Please drop me suggestions or questions via email - minowang0874@gmail.com
