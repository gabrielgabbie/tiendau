// Category lists and the keyword matcher used by quick add.

export const EXP_CATS = ["Food & Drinks","Transport","Shopping","Bills","Housing","Health","Beauty & Care","Entertainment","Travel","Education","Gifts","Other"];
export const INC_CATS = ["Salary","Freelance","Bonus","Gift","Investment","Refund","Other income"];
export const ALL_CATS = [...EXP_CATS, ...INC_CATS];

/** Older records may use names that were later changed. */
export const RENAMED = { Food: "Food & Drinks" };
export const migrateCategory = (o) => { if (o && RENAMED[o.category]) o.category = RENAMED[o.category]; return o; };

// Category words, matched as whole words. Unaccented spellings are listed where they can't be confused with something else.
export const CAT_WORDS={
 "Food & Drinks":["food","lunch","dinner","breakfast","brunch","meal","coffee","cafe","café","tea","milk tea","boba","drink","drinks","beer","wine","snack","snacks","dessert","groceries","grocery","market","supermarket","restaurant","pizza","burger","bread","fruit","grab food","grabfood","shopee food","shopeefood","baemin","be food","bbq",
  "ăn","ăn sáng","ăn trưa","ăn tối","ăn vặt","ăn uống","đồ ăn","thức ăn","cơm","cơm tấm","cơm văn phòng","phở","bún","bún chả","bún bò","bún riêu","bánh mì","bánh","bánh cuốn","bánh xèo","mì","mì cay","hủ tiếu","cháo","xôi","lẩu","nướng","ốc","gà","gà rán","vịt","cá","thịt","rau","trứng","sữa","trái cây","hoa quả","cà phê","trà","trà sữa","trà đá","sinh tố","nước ép","nước ngọt","nước mía","nước suối","bia","rượu","nhậu","quán","đi chợ","chợ","siêu thị","tạp hóa","bách hóa xanh","bhx","winmart","coopmart","co.op","circle k","gs25","family mart","ministop","7-eleven","kfc","lotteria","jollibee","highlands","phúc long","starbucks","katinat","cộng cà phê","the coffee house",
  "đá xay","sinh tố","smoothie","frappe","latte","matcha","cacao","milo","soda","nước dừa","nước cam","nước chanh","trà chanh","trà đào","trà tắc","hồng trà","lục trà","bạc xỉu","sữa chua","yaourt","kem","chè","bánh flan","tàu hũ","rau má","mixue","gong cha","tocotoco","koi thé",
  "dâu","dâu tây","thơm","dứa","xoài","chuối","táo","quýt","nho","ổi","mít","bơ","dừa","dưa hấu","thanh long","bưởi","sầu riêng","măng cụt","chôm chôm","vải","nhãn","chanh dây",
  "da xay","sua chua","nuoc dua","nuoc cam","tra chanh","tra dao","bac xiu","dau tay","xoai","sau rieng",
  "an sang","an trua","an toi","an vat","an uong","do an","com tam","pho","pho bo","banh mi","bun cha","bun bo","hu tieu","ca phe","cafe sua","tra sua","tra da","sinh to","nuoc mia","nhau","di cho","sieu thi","tap hoa","trai cay","hoa qua"],
 Transport:["grab","grabbike","grabcar","be","xanh sm","gojek","taxi","uber","bus","metro","train","fuel","petrol","gas","parking","toll","car wash",
  "xe","xe ôm","xe buýt","buýt","tàu","tàu điện","xăng","đổ xăng","gửi xe","giữ xe","vé xe","phí đường","cầu đường","sửa xe","rửa xe","bảo dưỡng xe","thay nhớt",
  "xang","do xang","gui xe","giu xe","xe om","xe buyt","sua xe","rua xe","thay nhot"],
 Shopping:["shopping","shop","mall","clothes","shirt","shoes","bag","socks","shopee","lazada","tiki","tiktok shop","amazon","uniqlo","cosmetics","skincare","makeup",
  "mua sắm","mua đồ","quần","áo","quần áo","giày","dép","túi","mỹ phẩm","son","nước hoa","sữa rửa mặt","dầu gội","kem chống nắng","đồ dùng","gia dụng","điện máy","đồ chơi",
  "mua sam","mua do","quan ao","my pham","gia dung","dien may"],
 Bills:["bill","bills","electric","electricity","water bill","internet","wifi","phone bill","mobile","data plan","subscription","netflix","spotify","youtube premium","icloud","google one","chatgpt","claude",
  "điện","tiền điện","hóa đơn","tiền nước","hóa đơn nước","mạng","cước","điện thoại","nạp tiền","nạp card","nạp điện thoại","4g","5g","truyền hình","gas bill",
  "tien dien","tien nuoc","hoa don","tien mang","nap tien","nap card","dien thoai"],
 Housing:["rent","house","apartment","furniture","management fee",
  "tiền nhà","thuê nhà","nhà","phòng trọ","trọ","tiền trọ","tiền phòng","căn hộ","phí quản lý","sửa nhà","nội thất",
  "tien nha","thue nha","phong tro","tien tro","tien phong","can ho","phi quan ly","sua nha","noi that"],
 Health:["doctor","hospital","clinic","pharmacy","medicine","dentist","gym","yoga","vitamin","insurance",
  "thuốc","nhà thuốc","bệnh viện","phòng khám","khám","khám bệnh","nha sĩ","nha khoa","răng","bảo hiểm","tập gym",
  "thuoc","nha thuoc","benh vien","phong kham","kham benh","nha khoa","bao hiem"],
 Entertainment:["movie","movies","cinema","cgv","lotte cinema","galaxy","game","games","steam","concert","karaoke","party","bar","club","bowling",
  "phim","xem phim","rạp","nhạc","hát","bida","bi-a","đi chơi","đi dạo","dã ngoại","picnic","cắm trại","camping",
  "rap phim","di choi","da ngoai","cam trai"],
 "Beauty & Care":["spa","massage","salon","hair salon","barber","barbershop","haircut","hair","nail","nails","manicure","pedicure","facial","waxing","eyelash","lash",
  "làm tóc","cắt tóc","hớt tóc","gội đầu","gội","tẩy tóc","nhuộm tóc","uốn tóc","duỗi tóc","ép tóc","phục hồi tóc","tiệm tóc","salon tóc","cạo râu","làm nail","làm móng","sơn móng","nối mi","uốn mi","wax","wax lông","triệt lông","chăm sóc da","lấy nhân mụn","đắp mặt nạ","xông hơi","gội dưỡng sinh","thẩm mỹ","thẩm mỹ viện",
  "lam toc","cat toc","hot toc","goi dau","tay toc","nhuom toc","uon toc","duoi toc","lam nail","lam mong","son mong","noi mi","triet long","cham soc da","xong hoi","tham my"],
 Travel:["hotel","homestay","villa","resort","airbnb","agoda","booking","flight","trip","tour","visa","vietjet","vietnam airlines","bamboo airways",
  "khách sạn","vé máy bay","máy bay","du lịch","phượt","vé tàu",
  "khach san","ve may bay","may bay","du lich","phuot"],
 Education:["book","books","course","class","tuition","udemy","coursera","english","ielts","toeic",
  "sách","khóa học","lớp","học","học phí","tiếng anh","học thêm",
  "sach","khoa hoc","hoc phi","tieng anh","hoc them"],
 Gifts:["gift","present","wedding","birthday","charity","donation","flowers",
  "quà","tặng","đám cưới","mừng cưới","cô dâu","chú rể","đám giỗ","sinh nhật","lì xì","từ thiện","hoa","viếng",
  "qua tang","dam cuoi","mung cuoi","sinh nhat","li xi","tu thien"],
};
// Trip destinations: every province and major city of Vietnam (the names people use day to day),
// well-known tourist spots, and a few popular trips abroad, with and without accents. They only decide
// the category when nothing more specific matched (or only a going-out word did): "đi chơi đà lạt" is
// Travel, but "lẩu đà lạt" stays Food and "vé xe đi đà lạt" Transport. Place names are taken out before
// the other words are matched, so the "tàu" in "Vũng Tàu" is never read as a train.
// Unaccented spellings that are also everyday words or English ("hue", "my son") are left out.
const PROVINCES=[
  "hà nội","ha noi","hanoi","sài gòn","sai gon","saigon","hồ chí minh","ho chi minh","tp hcm","tphcm","hải phòng","hai phong","đà nẵng","da nang","danang","cần thơ","can tho","huế",
  "hà giang","ha giang","cao bằng","cao bang","bắc kạn","bac kan","lạng sơn","lang son","tuyên quang","tuyen quang","thái nguyên","thai nguyen","bắc giang","bac giang","quảng ninh","quang ninh",
  "lào cai","lao cai","yên bái","yen bai","phú thọ","phu tho","điện biên","dien bien","lai châu","lai chau","sơn la","son la","hòa bình","hoa binh",
  "bắc ninh","bac ninh","vĩnh phúc","vinh phuc","hưng yên","hung yen","hải dương","hai duong","thái bình","thai binh","nam định","nam dinh","hà nam","ha nam","ninh bình","ninh binh",
  "thanh hóa","thanh hoa","nghệ an","nghe an","hà tĩnh","ha tinh","quảng bình","quang binh","quảng trị","quang tri","thừa thiên huế","quảng nam","quang nam","quảng ngãi","quang ngai",
  "bình định","binh dinh","phú yên","phu yen","khánh hòa","khanh hoa","ninh thuận","ninh thuan","bình thuận","binh thuan",
  "kon tum","gia lai","đắk lắk","đắc lắc","dak lak","đắk nông","dak nong","lâm đồng","lam dong",
  "bình phước","binh phuoc","bình dương","binh duong","đồng nai","dong nai","tây ninh","tay ninh","bà rịa","ba ria","vũng tàu","vung tau",
  "long an","tiền giang","tien giang","bến tre","ben tre","trà vinh","tra vinh","vĩnh long","vinh long","đồng tháp","dong thap","an giang","kiên giang","kien giang",
  "hậu giang","hau giang","sóc trăng","soc trang","bạc liêu","bac lieu","cà mau","ca mau",
];
const SPOTS=[
  "sa pa","sapa","fansipan","y tý","mù cang chải","mu cang chai","mộc châu","moc chau","mai châu","mai chau","pù luông","pu luong","đồng văn","dong van","mèo vạc","meo vac","mã pí lèng","ma pi leng",
  "ba bể","bản giốc","ban gioc","hạ long","ha long","halong","cát bà","cat ba","cô tô","co to","quan lạn","quan lan","tuần châu","tuan chau","yên tử","yen tu","tam đảo","tam dao","ba vì","ba vi",
  "tam cốc","tam coc","tràng an","trang an","bái đính","bai dinh","đồ sơn","do son","sầm sơn","sam son","cửa lò","cua lo","phong nha","thiên cầm","thien cam",
  "lý sơn","ly son","hội an","hoi an","bà nà","ba na hills","mỹ sơn","cù lao chàm","cu lao cham","sơn trà","son tra",
  "quy nhơn","quy nhon","kỳ co","ky co","eo gió","eo gio","tuy hòa","tuy hoa","nha trang","cam ranh","ninh chữ","ninh chu","vĩnh hy","vinh hy","mũi né","mui ne","phan thiết","phan thiet",
  "đà lạt","da lat","dalat","bảo lộc","bao loc","buôn ma thuột","buon ma thuot","pleiku","măng đen","mang den",
  "long hải","long hai","hồ tràm","ho tram","côn đảo","con dao","phú quốc","phu quoc","nam du","hà tiên","ha tien","châu đốc","chau doc","cái răng","cai rang","núi bà đen","nui ba den",
];
const ABROAD=["bangkok","thái lan","thai lan","singapore","bali","seoul","hàn quốc","han quoc","tokyo","osaka","nhật bản","nhat ban","đài loan","dai loan","hồng kông","hong kong","phnom penh","siem reap","kuala lumpur","malaysia","trung quốc","châu âu","chau au","paris"];
export const PLACES=[...PROVINCES,...SPOTS,...ABROAD];
const reEsc=w=>w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const CAT_RE=Object.entries(CAT_WORDS).map(([c,ws])=>[c,ws.map(w=>[w,new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(w.normalize("NFC"))}(?![\\p{L}\\p{N}])`,"iu")])]);
const PLACE_RE=PLACES.map(w=>new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(w.normalize("NFC"))}(?![\\p{L}\\p{N}])`,"iu"));
export function guessCat(t,income){
  t=String(t||"").normalize("NFC");
  if(income){if(/salary|lương|luong/i.test(t))return "Salary";if(/bonus|thưởng|thuong/i.test(t))return "Bonus";if(/freelance|project|client|dự án|du an/i.test(t))return "Freelance";if(/refund|hoàn|hoan tien/i.test(t))return "Refund";if(/gift|quà|lì xì|li xi|mừng/i.test(t))return "Gift";if(/dividend|interest|lãi|cổ tức|stock|chứng khoán/i.test(t))return "Investment";return "Other income"}
  // place names are taken out first, so "tàu" in "Vũng Tàu" isn't read as a train
  let place=false;
  for(const re of PLACE_RE){const r=new RegExp(re.source,"giu");if(r.test(t)){place=true;t=t.replace(r," ")}}
  // the longest matching phrase wins, so "grab food" beats "grab" and "nhà thuốc" beats "nhà"
  let best=null;
  for(const [c,list] of CAT_RE)for(const [w,re] of list)if((!best||w.length>best.len)&&re.test(t))best={c,len:w.length};
  if(place&&(!best||best.c==="Entertainment"))return "Travel";
  return best?best.c:"Other";
}
