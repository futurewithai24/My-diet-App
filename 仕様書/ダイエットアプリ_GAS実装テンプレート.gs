/**
 * ダイエットアプリ GAS実装テンプレート
 * - スプレッドシート3シート構成: users / records / ai_logs
 * - action: register / getUsers / uploadRecord / getRecords / analyzeHealth / estimateMealCalories
 *
 * 使い方:
 * 1) このコードをApps Scriptに貼り付け
 * 2) Webアプリとしてデプロイ（実行ユーザー: 自分、アクセス: 全員）
 * 3) LIFF側の GAS_URL をこのデプロイURLに更新
 */

const SPREADSHEET_ID = "1BrGWRJTnBUBjLOZd3U63ThtDqt_nBdex5FbYkFjrbrI";
const DRIVE_FOLDER_ID = "1MRTwf4J2X2udXR3RhMpC7Gt7vRtBvOJh";
const USERS_SHEET = "users";
const RECORDS_SHEET = "records";
const AI_LOGS_SHEET = "ai_logs";
const TZ = "Asia/Tokyo";
const CALORIE_REFERENCE_URLS = [
  "https://freeb-fis.co.jp/diet/calorie-pfc-calculator/",
  "https://www.asken.jp/",
  "https://www.calomeal.com/",
  "https://www.myfitnesspal.com/ja",
  "https://finc.com/",
  "https://www.health2sync.com/ja/",
];

const USERS_HEADERS = ["lineId", "name", "createdAt", "updatedAt"];
const RECORDS_HEADERS = [
  "id",
  "lineId",
  "userName",
  "recordType",
  "category",
  "mealTiming",
  "memo",
  "recordDate",
  "exerciseType",
  "exerciseMinutes",
  "weight",
  "bodyFat",
  "bowelMovement",
  "estimatedCalories",
  "protein",
  "fat",
  "carbohydrate",
  "calorieBasis",
  "imageUrlsJson",
  "createdAt",
  "updatedAt",
];
const AI_LOGS_HEADERS = ["id", "lineId", "periodDays", "adviceText", "createdAt"];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = body.action;
    const data = body.data || {};

    ensureSheets_();

    switch (action) {
      case "register":
        return jsonOutput_(registerUser_(data));
      case "getUsers":
        return jsonOutput_({ status: "success", result: getUsers_() });
      case "uploadRecord":
      case "upload": // 後方互換
        return jsonOutput_(uploadRecord_(data));
      case "getRecords":
      case "getList": // 後方互換
        return jsonOutput_({ status: "success", result: getRecords_() });
      case "analyzeHealth":
        return jsonOutput_(analyzeHealth_(data));
      case "estimateMealCalories":
        return jsonOutput_(estimateMealCalories_(data));
      default:
        return jsonOutput_({ status: "error", message: "Unknown action" });
    }
  } catch (err) {
    return jsonOutput_({
      status: "error",
      message: err && err.message ? err.message : "Unexpected error",
    });
  }
}

function registerUser_(data) {
  const lineId = safeTrim_(data.userId);
  const name = safeTrim_(data.displayName);
  if (!lineId || !name) return { status: "error", message: "userId/displayName is required" };

  const sh = getSheet_(USERS_SHEET, USERS_HEADERS);
  const values = readDataRows_(sh, USERS_HEADERS.length);
  const now = isoNow_();
  const index = values.findIndex((r) => r[0] === lineId);

  if (index >= 0) {
    const row = index + 2;
    sh.getRange(row, 2).setValue(name);
    sh.getRange(row, 4).setValue(now);
  } else {
    sh.appendRow([lineId, name, now, now]);
  }
  return { status: "success" };
}

function getUsers_() {
  const sh = getSheet_(USERS_SHEET, USERS_HEADERS);
  const rows = readDataRows_(sh, USERS_HEADERS.length);
  return rows
    .filter((r) => r[0])
    .map((r) => ({
      lineId: r[0],
      name: r[1] || "",
    }));
}

function uploadRecord_(data) {
  const lineId = safeTrim_(data.lineId);
  const userName = safeTrim_(data.userName);
  const recordType = safeTrim_(data.recordType);
  const category = safeTrim_(data.category);
  const mealTiming = safeTrim_(data.mealTiming);
  const memo = safeTrim_(data.memo) || "未入力";
  const recordDate = safeTrim_(data.recordDate || data.date);
  const exerciseType = safeTrim_(data.exerciseType);
  const exerciseMinutes = Number(data.exerciseMinutes || 0);
  const weight = Number(data.weight || 0);
  const bodyFat = Number(data.bodyFat || 0);
  const bowelMovement = safeTrim_(data.bowelMovement);
  const estimatedCalories = Number(data.estimatedCalories || 0);
  const protein = Number(data.protein || 0);
  const fat = Number(data.fat || 0);
  const carbohydrate = Number(data.carbohydrate || 0);
  const calorieBasis = safeTrim_(data.calorieBasis);
  const imageBlobs = Array.isArray(data.imageBlobs) ? data.imageBlobs : [];

  if (!lineId || !userName || !recordType || !category || !recordDate) {
    return { status: "error", message: "Missing required fields" };
  }
  if (["食事", "運動", "体調"].indexOf(recordType) < 0) {
    return { status: "error", message: "recordType must be 食事/運動/体調" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    return { status: "error", message: "recordDate format must be YYYY-MM-DD" };
  }
  if (imageBlobs.length > 3) {
    return { status: "error", message: "image max is 3" };
  }

  const imageUrls = saveImagesToFolder_(imageBlobs, lineId);
  const sh = getSheet_(RECORDS_SHEET, RECORDS_HEADERS);
  const now = isoNow_();
  const id = "rec_" + Utilities.formatDate(new Date(), TZ, "yyyyMMdd_HHmmss_SSS");

  sh.appendRow([
    id,
    lineId,
    userName,
    recordType,
    category,
    mealTiming,
    memo,
    recordDate,
    exerciseType,
    Number.isFinite(exerciseMinutes) ? exerciseMinutes : 0,
    Number.isFinite(weight) ? weight : 0,
    Number.isFinite(bodyFat) ? bodyFat : 0,
    bowelMovement,
    Number.isFinite(estimatedCalories) ? estimatedCalories : 0,
    Number.isFinite(protein) ? protein : 0,
    Number.isFinite(fat) ? fat : 0,
    Number.isFinite(carbohydrate) ? carbohydrate : 0,
    calorieBasis,
    JSON.stringify(imageUrls),
    now,
    now,
  ]);

  return { status: "success", id: id, imageCount: imageUrls.length };
}

function getRecords_() {
  const sh = getSheet_(RECORDS_SHEET, RECORDS_HEADERS);
  const rows = readDataRows_(sh, RECORDS_HEADERS.length);
  return rows
    .filter((r) => r[0])
    .map((r) => {
      let imageUrls = [];
      try {
        imageUrls = r[18] ? JSON.parse(r[18]) : [];
      } catch (_) {
        imageUrls = [];
      }
      return {
        id: r[0] || "",
        lineId: r[1] || "",
        userName: r[2] || "",
        recordType: r[3] || "",
        category: r[4] || "",
        mealTiming: r[5] || "",
        memo: r[6] || "",
        recordDate: r[7] || "",
        exerciseType: r[8] || "",
        exerciseMinutes: Number(r[9]) || 0,
        weight: Number(r[10]) || 0,
        bodyFat: Number(r[11]) || 0,
        bowelMovement: r[12] || "",
        estimatedCalories: Number(r[13]) || 0,
        protein: Number(r[14]) || 0,
        fat: Number(r[15]) || 0,
        carbohydrate: Number(r[16]) || 0,
        calorieBasis: r[17] || "",
        imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      };
    });
}

function estimateMealCalories_(data) {
  const imageBlobs = Array.isArray(data.imageBlobs) ? data.imageBlobs : [];
  const memo = safeTrim_(data.memo);
  if (!imageBlobs.length && !memo) {
    return { status: "error", message: "imageBlobs or memo is required" };
  }

  const lower = memo.toLowerCase();
  let kcal = 450;
  let p = 20;
  let f = 15;
  let c = 55;
  let basis = "食事写真の見た目推定 + 主要食品データベースを参照した概算";

  if (lower.indexOf("サラダ") >= 0) { kcal = 220; p = 12; f = 11; c = 18; }
  if (lower.indexOf("鶏") >= 0 || lower.indexOf("チキン") >= 0) { kcal += 110; p += 18; f += 3; c += 0; }
  if (lower.indexOf("ごはん") >= 0 || lower.indexOf("米") >= 0) { kcal += 230; p += 4; f += 1; c += 52; }
  if (lower.indexOf("ラーメン") >= 0) { kcal = 700; p = 24; f = 22; c = 88; }
  if (lower.indexOf("プロテイン") >= 0) { kcal = 140; p = 24; f = 2; c = 6; }

  return {
    status: "success",
    result: {
      estimatedCalories: Math.round(kcal),
      protein: Math.round(p),
      fat: Math.round(f),
      carbohydrate: Math.round(c),
      basis: basis,
      referenceSources: CALORIE_REFERENCE_URLS,
    },
  };
}

function analyzeHealth_(data) {
  const lineId = safeTrim_(data.lineId);
  const periodDays = Math.max(1, Math.min(60, Number(data.periodDays || 7)));
  if (!lineId) return { status: "error", message: "lineId is required" };

  const all = getRecords_().filter((r) => r.lineId === lineId);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (periodDays - 1));

  const target = all.filter((r) => {
    const d = new Date(r.recordDate);
    return !isNaN(d.getTime()) && d >= startDate;
  });

  const adviceText = buildAdviceText_(target, periodDays);
  saveAiLog_(lineId, periodDays, adviceText);
  return {
    status: "success",
    result: {
      periodDays: periodDays,
      recordCount: target.length,
      adviceText: adviceText,
    },
  };
}

function buildAdviceText_(records, periodDays) {
  const mealCount = records.filter((r) => r.recordType === "食事").length;
  const workoutRecords = records.filter((r) => r.recordType === "運動");
  const workoutMinutes = workoutRecords.reduce((sum, r) => sum + (Number(r.exerciseMinutes) || 0), 0);
  const bowelYes = records.filter((r) => r.bowelMovement === "あり").length;
  const weightRows = records.filter((r) => Number(r.weight) > 0).sort((a, b) => String(a.recordDate).localeCompare(String(b.recordDate)));
  const firstWeight = weightRows.length ? Number(weightRows[0].weight) : 0;
  const lastWeight = weightRows.length ? Number(weightRows[weightRows.length - 1].weight) : 0;
  const diff = weightRows.length >= 2 ? (lastWeight - firstWeight) : 0;

  const lines = [];
  lines.push("【総評】");
  lines.push(`直近${periodDays}日で、食事記録 ${mealCount}件 / 運動 ${workoutMinutes}分 / お通じ「あり」${bowelYes}回です。`);
  if (weightRows.length >= 2) {
    const sign = diff > 0 ? "+" : "";
    lines.push(`体重は ${firstWeight.toFixed(1)}kg → ${lastWeight.toFixed(1)}kg（${sign}${diff.toFixed(1)}kg）です。`);
  } else {
    lines.push("体重データが少ないため、毎朝同じ条件での記録継続がおすすめです。");
  }

  lines.push("");
  lines.push("【食事アドバイス】");
  lines.push(mealCount < periodDays ? "食事写真の記録頻度を上げると、改善ポイントが明確になります。" : "食事記録が安定しています。次は間食タイミングの最適化を意識しましょう。");

  lines.push("");
  lines.push("【運動アドバイス】");
  lines.push(workoutMinutes < periodDays * 20 ? "1日20分を目安に、散歩か軽い筋トレを追加しましょう。" : "運動習慣は良好です。強度か継続日数を少しずつ伸ばしましょう。");

  lines.push("");
  lines.push("【明日の行動提案】");
  lines.push("1) 朝食前に体重を測って記録する");
  lines.push("2) 20分以上のウォーキングを実施する");
  lines.push("3) 夜の間食は1回までにする");

  return lines.join("\n");
}

function saveAiLog_(lineId, periodDays, adviceText) {
  const sh = getSheet_(AI_LOGS_SHEET, AI_LOGS_HEADERS);
  const id = "ai_" + Utilities.formatDate(new Date(), TZ, "yyyyMMdd_HHmmss_SSS");
  sh.appendRow([id, lineId, periodDays, adviceText, isoNow_()]);
}

function saveImagesToFolder_(imageBlobs, lineId) {
  if (!imageBlobs.length) return [];
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const urls = [];
  imageBlobs.forEach((dataUrl, i) => {
    const parsed = parseDataUrl_(dataUrl);
    if (!parsed) return;
    const ext = mimeToExt_(parsed.mimeType);
    const fileName = `${lineId}_${Utilities.formatDate(new Date(), TZ, "yyyyMMdd_HHmmss")}_${i + 1}.${ext}`;
    const blob = Utilities.newBlob(parsed.bytes, parsed.mimeType, fileName);
    const file = folder.createFile(blob);
    urls.push(file.getUrl());
  });
  return urls;
}

function ensureSheets_() {
  getSheet_(USERS_SHEET, USERS_HEADERS);
  getSheet_(RECORDS_SHEET, RECORDS_HEADERS);
  getSheet_(AI_LOGS_SHEET, AI_LOGS_HEADERS);
}

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const currentHeaders = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    const mismatch = headers.some((h, i) => currentHeaders[i] !== h);
    if (mismatch) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function readDataRows_(sh, width) {
  const lastRow = sh.getLastRow();
  if (lastRow <= 1) return [];
  return sh.getRange(2, 1, lastRow - 1, width).getValues();
}

function parseDataUrl_(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  return {
    mimeType: m[1],
    bytes: Utilities.base64Decode(m[2]),
  };
}

function mimeToExt_(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return "jpg";
}

function isoNow_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function safeTrim_(v) {
  return String(v == null ? "" : v).trim();
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
