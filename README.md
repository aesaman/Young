# رهگیر مطالعه کنکور

## Firebase (همگام‌سازی و لینک زنده)

1. برو به https://console.firebase.google.com و یک پروژه بساز
2. Build → Realtime Database → Create (شروع در حالت test برای توسعه)
3. Project settings → Your apps → Web → ثبت اپ
4. این سه مقدار را کپی کن:
   - apiKey
   - projectId
   - databaseURL (مثل https://PROJECT-default-rtdb.REGION.firebasedatabase.app)
5. در اپ: مدیریت → فیلدهای Firebase را پر کن → یک «کد همگام» بساز → ذخیره
6. همان کد و Firebase را روی گوشی و لپ‌تاپ وارد کن
7. اشتراک → لینک زنده مشاور

قوانین Realtime Database برای تست (بعداً محدود کن):

```
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

## بک‌آپ

مدیریت → دانلود / آپلود بک‌آپ JSON

## نسخه

v20
