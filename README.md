# VolleyScore Prototype — Fullscreen + Libero Update

ต้นแบบระบบวอลเลย์บอล Responsive Web App สำหรับมือถือ, iPad และ Desktop

## หน้าที่ 1 — Live Score
- Best of 3 / Best of 5
- เซตปกติ 25 คะแนน / เซตตัดสิน 15 คะแนน / ต้องห่าง 2 คะแนน
- +1 / −1 / Undo
- สลับฝั่ง, ทีมเสิร์ฟ
- Fullscreen เป็น Toggle จริง: กดเข้าเต็มจอ / กดซ้ำออกเต็มจอ และสถานะปุ่มตาม `fullscreenchange`
- Point Flow แบบตัวเลขล้วนพร้อม Animation
- Light / Dark Mode (น้ำเงิน–แดง–เหลือง)

## หน้าที่ 2 — Match History & Export
- เก็บประวัติแมตช์ใน Local Storage ของ Prototype
- Preview ผลการแข่งขัน
- Export PNG 9:16, 4:5, 1:1, 16:9
- Print / Save PDF
- Template Export ใช้ Light/Dark Theme เดียวกับระบบ
- รองรับโลโก้ทีมแบบ Optional

## หน้าที่ 3 — Rotation, Player Stats, Substitution & Libero
- รายชื่อผู้เล่นไม่จำกัดจำนวนใน Prototype
- เลือก Starting Lineup P1–P6 ก่อนแต่ละเซต
- เพิ่มตัวสำรองได้ตามต้องการ
- กำหนด Libero ได้สูงสุด 2 คน
- Rotation อัตโนมัติเมื่อทีมที่ติดตามได้ Side-out
- Point Flow แนวนอนด้านบน
- บันทึกสาเหตุของแต้มและผู้เล่นที่เกี่ยวข้อง
- Player Performance: Kill / Ace / Block / Error
- Export Player Performance PNG

### Normal Substitution
- ตั้งจำนวนสิทธิ์เปลี่ยนตัวต่อเซต: 6 / 8 / กำหนดเอง 1–30
- Pair Lock เช่น `#1 ⇄ #3`
- ตัวสำรองที่เข้ามาออกได้โดยตัวจริงคนเดิมกลับเข้าเท่านั้น
- Pair ปิดหลังตัวจริงกลับเข้า
- ตรวจ Illegal Substitution และบอกเหตุผล
- เก็บประวัติพร้อมสกอร์ ณ เวลาที่เปลี่ยน

### Libero Replacement
- มีปุ่ม `Libero Replacement` แยกจาก Normal Substitution
- ไม่ถูกนับรวมใน SUB limit
- Libero เข้าแทนได้เฉพาะตำแหน่งแดนหลัง P1 / P5 / P6
- มี Acting Libero ได้เพียง 1 คนในสนาม
- Acting Libero ออกได้โดยผู้เล่นเดิมของตำแหน่งนั้น หรือสลับเป็น Libero คนที่ 2
- ระบบตรวจว่าต้องมี Rally จบอย่างน้อย 1 Rally ระหว่าง Libero Replacement ต่อเนื่อง
- เมื่อ Rotation ทำให้ Libero ไปแดนหน้า ระบบคืนผู้เล่นเดิมอัตโนมัติ
- มีประวัติ Libero Replacement แยกต่างหากพร้อมสกอร์
- Undo Rally ที่ทำให้เกิด Auto Return จะย้อนสถานะ Libero ให้ด้วย

## Supabase
Project: `hliwrtmamrukiyvpzxby`

ฐานข้อมูลรองรับ:
- matches / match_sets / score_events
- players / match_rosters / set_lineups
- set_rotation_state / rotation_events / player_actions
- set_court_slots
- substitution_pairs / substitution_events
- set_libero_state / libero_replacement_events

มี RLS และ RPC สำหรับ Normal Substitution, Rotation และ Libero Replacement

> หมายเหตุ: หน้า Prototype ยังใช้ Local Storage เพื่อทดลอง UX ก่อนเชื่อม Frontend เข้ากับ Supabase จริง
