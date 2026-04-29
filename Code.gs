// ==========================================
//  UNIVERSAL ATTENDANCE SYSTEM
//  100% Dynamic - All config from Settings tab
//  Works on ANY Google Account
// ==========================================


// ==========================================
//  1. READ ALL CONFIG FROM "Settings" TAB
// ==========================================

function getSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Settings");

  if (!sheet) {
    throw new Error("Settings tab not found! Run setup() first.");
  }

  var data = sheet.getDataRange().getValues();
  var config = {};

  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][0] || "").trim();
    var value = String(data[i][1] || "").trim();
    if (key && value) config[key] = value;
  }

  // Validate required settings
  var required = ["REG_SHEET_TAB"];
  for (var r = 0; r < required.length; r++) {
    if (!config[required[r]]) {
      throw new Error("Missing required setting: " + required[r] + ". Check your Settings tab.");
    }
  }

  return config;
}


// ==========================================
//  2. AUTO-DETECT COLUMNS BY HEADER NAME
// ==========================================

function getColumnMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};

  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i]).trim();
    if (header) {
      map[header] = i + 1; // 1-indexed column number
    }
  }

  return map;
}

function normalizeHeader(text) {
  // Strip colons, asterisks, extra spaces from header text
  return String(text).replace(/[:*]/g, "").trim().toLowerCase();
}

function findColumn(map, possibleNames) {
  // Pass 1: Exact match (case-insensitive, after stripping : and *)
  for (var i = 0; i < possibleNames.length; i++) {
    var target = normalizeHeader(possibleNames[i]);
    for (var key in map) {
      if (normalizeHeader(key) === target) {
        return map[key];
      }
    }
  }

  // Pass 2: Partial match (header CONTAINS the search term)
  for (var i = 0; i < possibleNames.length; i++) {
    var target = normalizeHeader(possibleNames[i]);
    for (var key in map) {
      var normalized = normalizeHeader(key);
      if (normalized.indexOf(target) !== -1 || target.indexOf(normalized) !== -1) {
        return map[key];
      }
    }
  }

  return -1; // Not found
}


// ==========================================
//  3. REGISTRATION (Form Submit Trigger)
// ==========================================

function onFormSubmit(e) {
  if (!e || !e.range) return;

  var config = getSettings();
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  var cols = getColumnMap(sheet);

  // Find columns by common header names
  var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name", "Complete Name"]);
  var emailCol = findColumn(cols, ["Email Address", "Email", "email address", "email"]);

  if (nameCol === -1 || emailCol === -1) {
    Logger.log("ERROR: Could not find Name or Email column.");
    Logger.log("Available headers: " + JSON.stringify(Object.keys(cols)));
    return;
  }

  var name = sheet.getRange(row, nameCol).getValue();
  var email = sheet.getRange(row, emailCol).getValue();

  if (!name || !email) {
    Logger.log("ERROR: Name or Email is empty at row " + row);
    return;
  }

  // Generate unique ID
  var certId = "CERT-" + Utilities.getUuid().slice(0, 8).toUpperCase();
  var qrData = name + " | " + certId;
  var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent(qrData);

  // Ensure CERT_ID and STATUS columns exist (create if needed)
  var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID", "CertID"]);
  var statusCol = findColumn(cols, ["STATUS", "Status", "Attendance Status"]);
  var scanTimeCol = findColumn(cols, ["SCAN_TIME", "Scan Time", "Check-in Time"]);

  if (certIdCol === -1) {
    certIdCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, certIdCol).setValue("CERT_ID");
  }
  if (statusCol === -1) {
    statusCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, statusCol).setValue("STATUS");
  }
  if (scanTimeCol === -1) {
    scanTimeCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, scanTimeCol).setValue("SCAN_TIME");
  }

  // Get branding from settings
  var eventName = config.EVENT_NAME || "Event";
  var orgName = config.ORG_NAME || "";
  var primaryColor = config.PRIMARY_COLOR || "#800000";
  var accentColor = config.ACCENT_COLOR || "#FFD700";

  // Send QR email
  try {
    var htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; text-align: center; padding: 30px;">'
      + '<div style="background: linear-gradient(135deg, ' + primaryColor + ', #333); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">'
      + '<h2 style="color: #FFFFFF; margin: 0;"><font color="#FFFFFF">' + eventName + '</font></h2>'
      + (orgName ? '<p style="color: #FFFFFF; margin: 5px 0 0 0; font-size: 13px;"><font color="#FFFFFF">' + orgName + '</font></p>' : '')
      + '</div>'
      + '<div style="background: #ffffff; padding: 30px; border: 1px solid #ddd;">'
      + '<h3 style="color: #333333;"><font color="#333333">Registration Confirmed!</font></h3>'
      + '<p style="color: #555555;"><font color="#555555">Hello <strong>' + name + '</strong>,</font></p>'
      + '<p style="color: #555555;"><font color="#555555">Present this QR code at the event:</font></p>'
      + '<img src="' + qrUrl + '" width="250" height="250" style="margin: 15px 0;" />'
      + '<p style="color: #555555;"><font color="#555555"><strong>' + name + '</strong><br/>ID: ' + certId + '</font></p>'
      + '</div>'
      + '<div style="background: ' + primaryColor + '; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">'
      + '<p style="color: #FFFFFF; margin: 0; font-size: 12px;"><font color="#FFFFFF">' + eventName + '</font></p>'
      + '</div>'
      + '</div>';

    GmailApp.sendEmail(email, "Your QR Code - " + eventName, "", {
      htmlBody: htmlBody,
      name: eventName
    });
    Logger.log("QR email sent to: " + email);
  } catch (err) {
    Logger.log("Email error: " + err);
  }

  // Update sheet
  sheet.getRange(row, certIdCol).setValue(certId);
  sheet.getRange(row, statusCol).setValue("QR SENT");
  Logger.log("Registered: " + name + " (" + certId + ")");
}


// ==========================================
//  4. GET DATA (doGet) - Returns all registrants
// ==========================================

function doGet(e) {
  try {
    var config = getSettings();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTab = config.REG_SHEET_TAB || "Form Responses 1";
    var sheet = ss.getSheetByName(sheetTab);

    if (!sheet) {
      return createJsonResponse({
        success: false, message: "Sheet '" + sheetTab + "' not found",
        registered: [], attendees: [], count: 0
      });
    }

    var cols = getColumnMap(sheet);
    var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name", "Complete Name"]);
    var emailCol = findColumn(cols, ["Email Address", "Email"]);
    var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID"]);
    var statusCol = findColumn(cols, ["STATUS", "Status"]);
    var scanTimeCol = findColumn(cols, ["SCAN_TIME", "Scan Time"]);

    if (nameCol === -1) {
      return createJsonResponse({
        success: false, message: "Name column not found in headers",
        registered: [], attendees: [], count: 0
      });
    }

    var values = sheet.getDataRange().getValues();
    var registeredList = [];
    var attendedList = [];

    for (var i = 1; i < values.length; i++) {
      var name = nameCol > 0 ? String(values[i][nameCol - 1] || "").trim() : "";
      var email = emailCol > 0 ? String(values[i][emailCol - 1] || "").trim() : "";
      var certId = certIdCol > 0 ? String(values[i][certIdCol - 1] || "").trim() : "";
      var status = statusCol > 0 ? String(values[i][statusCol - 1] || "").trim() : "";
      var scanTime = scanTimeCol > 0 ? values[i][scanTimeCol - 1] : "";

      if (!name) continue; // Skip empty rows

      registeredList.push({
        name: name,
        email: email,
        certId: certId,
        status: status
      });

      if (status === "ATTENDED") {
        attendedList.push({
          name: name,
          email: email,
          certId: certId,
          scanTime: scanTime ? new Date(scanTime).toISOString() : ""
        });
      }
    }

    return createJsonResponse({
      success: true,
      count: attendedList.length,
      totalRegistered: registeredList.length,
      registered: registeredList,
      attendees: attendedList,
      eventName: config.EVENT_NAME || "",
      orgName: config.ORG_NAME || "",
      primaryColor: config.PRIMARY_COLOR || "#800000",
      accentColor: config.ACCENT_COLOR || "#FFD700"
    });

  } catch (error) {
    return createJsonResponse({
      success: false, message: error.toString(),
      registered: [], attendees: [], count: 0
    });
  }
}


// ==========================================
//  5. SCANNING (doPost) - Mark attendance
// ==========================================

function doPost(e) {
  try {
    var config = getSettings();
    var data = JSON.parse(e.postData.contents);
    var qrContent = data.qrContent;

    Logger.log("Scan received: " + qrContent);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTab = config.REG_SHEET_TAB || "Form Responses 1";
    var sheet = ss.getSheetByName(sheetTab);

    if (!sheet) {
      return createJsonResponse({ success: false, message: "Sheet not found", name: "" });
    }

    var cols = getColumnMap(sheet);
    var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name", "Complete Name"]);
    var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID"]);
    var statusCol = findColumn(cols, ["STATUS", "Status"]);
    var scanTimeCol = findColumn(cols, ["SCAN_TIME", "Scan Time"]);

    if (certIdCol === -1 || statusCol === -1) {
      return createJsonResponse({ success: false, message: "CERT_ID or STATUS column not found", name: "" });
    }

    var values = sheet.getDataRange().getValues();
    var found = false;
    var message = "";
    var attendeeName = "";

    for (var i = 1; i < values.length; i++) {
      var rowCertId = String(values[i][certIdCol - 1] || "").trim();
      var rowName = nameCol > 0 ? String(values[i][nameCol - 1] || "").trim() : "";

      if (rowCertId && qrContent.includes(rowCertId)) {
        found = true;
        attendeeName = rowName;

        var currentStatus = String(values[i][statusCol - 1] || "").trim();

        if (currentStatus === "ATTENDED") {
          message = "Already checked in: " + rowName;
        } else {
          sheet.getRange(i + 1, statusCol).setValue("ATTENDED");
          if (scanTimeCol > 0) {
            sheet.getRange(i + 1, scanTimeCol).setValue(new Date());
          }
          message = "Welcome, " + rowName + "!";
          Logger.log("Marked ATTENDED: " + rowName);
        }
        break;
      }
    }

    if (!found) {
      message = "QR Code not recognized";
      Logger.log("No match for: " + qrContent);
    }

    return createJsonResponse({ success: found, message: message, name: attendeeName });

  } catch (error) {
    Logger.log("Error: " + error);
    return createJsonResponse({ success: false, message: "Error: " + error, name: "" });
  }
}


// ==========================================
//  HELPER
// ==========================================

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ==========================================
//  SETUP - Run this ONCE on a new account
// ==========================================

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check if Settings already exists
  if (ss.getSheetByName("Settings")) {
    Logger.log("Settings tab already exists!");
    Logger.log("If you want to recreate it, delete the existing one first.");
    return;
  }

  // Auto-detect the response sheet name
  var sheets = ss.getSheets();
  var detectedTab = "";
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName();
    if (sName.toLowerCase().indexOf("form response") !== -1 || sName.toLowerCase().indexOf("form_response") !== -1) {
      detectedTab = sName;
      break;
    }
  }
  if (!detectedTab && sheets.length > 0) {
    detectedTab = sheets[0].getName();
  }

  // Create Settings sheet
  var settings = ss.insertSheet("Settings");

  var rows = [
    ["Setting", "Value"],
    ["REG_SHEET_TAB", detectedTab],
    ["EVENT_NAME", "Your Event Name"],
    ["EVENT_DATE", "Event Date"],
    ["EVENT_LOCATION", "Event Location"],
    ["ORG_NAME", "Your Organization"],
    ["PRIMARY_COLOR", "#800000"],
    ["ACCENT_COLOR", "#FFD700"]
  ];

  settings.getRange(1, 1, rows.length, 2).setValues(rows);

  // Style header
  settings.getRange("A1:B1").setFontWeight("bold").setBackground("#333333").setFontColor("#FFFFFF");
  settings.getRange("A2:A" + rows.length).setFontWeight("bold").setBackground("#f5f5f5");
  settings.setColumnWidth(1, 180);
  settings.setColumnWidth(2, 350);

  // Add instructions
  settings.getRange("D1").setValue("INSTRUCTIONS");
  settings.getRange("D2").setValue("1. Fill in the values in Column B");
  settings.getRange("D3").setValue("2. REG_SHEET_TAB = the tab name where form responses go");
  settings.getRange("D4").setValue("3. Colors must be valid hex (e.g. #800000)");
  settings.getRange("D5").setValue("4. After filling in, run testSetup() to verify");
  settings.getRange("D1").setFontWeight("bold");
  settings.setColumnWidth(4, 400);

  Logger.log("=== SETUP COMPLETE ===");
  Logger.log("");
  Logger.log("Settings tab created!");
  Logger.log("Detected sheet tab: " + detectedTab);
  Logger.log("");
  Logger.log("NEXT STEPS:");
  Logger.log("1. Go to the Settings tab");
  Logger.log("2. Fill in your Event Name, Date, Location, etc.");
  Logger.log("3. Run testSetup() to verify everything works");
  Logger.log("4. Set up the form trigger (see setupTrigger())");
}


// ==========================================
//  SETUP TRIGGER - Creates the form trigger
// ==========================================

function setupTrigger() {
  // Delete existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onFormSubmit") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new trigger
  ScriptApp.newTrigger("onFormSubmit")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();

  Logger.log("Trigger created: onFormSubmit will run when the form is submitted.");
}


// ==========================================
//  TEST FUNCTIONS
// ==========================================

function testSetup() {
  Logger.log("=== TESTING SETUP ===\n");

  // Test settings
  try {
    var config = getSettings();
    Logger.log("[OK] Settings loaded:");
    for (var key in config) {
      Logger.log("   " + key + " = " + config[key]);
    }
  } catch (err) {
    Logger.log("[ERROR] " + err);
    Logger.log("Run setup() first!");
    return;
  }

  // Test sheet access
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetTab = config.REG_SHEET_TAB;
  var sheet = ss.getSheetByName(sheetTab);

  if (sheet) {
    Logger.log("\n[OK] Sheet found: " + sheetTab);
    Logger.log("   Rows: " + sheet.getLastRow());
    Logger.log("   Columns: " + sheet.getLastColumn());

    var cols = getColumnMap(sheet);
    Logger.log("\n   Column Map:");
    for (var header in cols) {
      Logger.log("   Col " + cols[header] + ": " + header);
    }

    var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name", "Complete Name"]);
    var emailCol = findColumn(cols, ["Email Address", "Email"]);
    Logger.log("\n   Name column: " + (nameCol > 0 ? "Col " + nameCol + " [OK]" : "[NOT FOUND]"));
    Logger.log("   Email column: " + (emailCol > 0 ? "Col " + emailCol + " [OK]" : "[NOT FOUND]"));
  } else {
    Logger.log("\n[ERROR] Sheet '" + sheetTab + "' not found!");
    Logger.log("Available sheets:");
    ss.getSheets().forEach(function(s, i) { Logger.log("   " + (i+1) + ". " + s.getName()); });
  }

  // Test triggers
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log("\nTriggers: " + triggers.length);
  triggers.forEach(function(t, i) {
    Logger.log("   " + (i+1) + ". " + t.getHandlerFunction() + " (" + t.getEventType() + ")");
  });

  Logger.log("\n=== TEST COMPLETE ===");
}

function testScan() {
  Logger.log("=== TEST SCAN ===\n");

  var config = getSettings();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(config.REG_SHEET_TAB);

  if (!sheet) {
    Logger.log("Sheet not found!");
    return;
  }

  var cols = getColumnMap(sheet);
  var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID"]);

  if (certIdCol === -1) {
    Logger.log("No CERT_ID column yet. Submit a form first or run a test registration.");
    return;
  }

  // Find first row with a cert ID
  var values = sheet.getDataRange().getValues();
  var testCertId = "";
  var testName = "";

  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][certIdCol - 1] || "").trim();
    if (id) {
      testCertId = id;
      var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name"]);
      testName = nameCol > 0 ? String(values[i][nameCol - 1] || "").trim() : "";
      break;
    }
  }

  if (!testCertId) {
    Logger.log("No registered users with CERT_ID found. Submit the form first.");
    return;
  }

  Logger.log("Testing scan for: " + testName + " (" + testCertId + ")");

  var testData = {
    postData: { contents: JSON.stringify({ qrContent: testName + " | " + testCertId }) }
  };

  var result = doPost(testData);
  Logger.log("Result: " + result.getContent());
}

function listSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("All sheets in this spreadsheet:");
  ss.getSheets().forEach(function(s, i) {
    Logger.log("   " + (i+1) + ". '" + s.getName() + "' (" + s.getLastRow() + " rows)");
  });
}
