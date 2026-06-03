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
    if (key && value) {
      config[key] = value;
      // Also add uppercase version for easier lookup
      config[key.toUpperCase().replace(/\s+/g, '_')] = value;
    }
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
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return {};
  
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};

  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i]).trim();
    // Store only the FIRST occurrence of a header name.
    // This prevents later duplicate headers (e.g., multiple "STATUS"
    // columns) from overriding the original, which is usually the one
    // used by formulas, dashboards, and users.
    if (header && !(header in map)) {
      map[header] = i + 1; // 1-indexed column number
    }
  }

  return map;
}

function normalizeHeader(text) {
  // Strip colons, asterisks, and collapse all whitespace into single spaces for better matching
  return String(text).replace(/[:*]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findColumn(map, possibleNames, excludeCols) {
  // Pass 1: Exact match (case-insensitive, after stripping : and *)
  for (var i = 0; i < possibleNames.length; i++) {
    var target = normalizeHeader(possibleNames[i]);
    for (var key in map) {
      if (excludeCols && excludeCols.indexOf(map[key]) !== -1) continue;
      if (normalizeHeader(key) === target) {
        return map[key];
      }
    }
  }

  // Pass 2: Partial match (header CONTAINS the search term)
  for (var i = 0; i < possibleNames.length; i++) {
    var target = normalizeHeader(possibleNames[i]);
    for (var key in map) {
      if (excludeCols && excludeCols.indexOf(map[key]) !== -1) continue;
      var normalized = normalizeHeader(key);
      // Avoid accidentally matching EMAIL_STATUS when we are looking for STATUS
      // or other status-related columns. This prevents IN/OUT values from being
      // written into the email status column.
      if (target.indexOf("status") !== -1 && normalized.indexOf("email") !== -1) {
        continue;
      }
      if (normalized.indexOf(target) !== -1 || target.indexOf(normalized) !== -1) {
        return map[key];
      }
    }
  }

  return -1; // Not found
}

// Return ALL columns whose header matches (exact normalized match) any of the provided names.
// This is used to handle sheets that accidentally have duplicate headers like:
// STATUS | SCAN_TIME | STATUS | SCAN_TIME ...
function findAllColumnsByHeaderNames(sheet, possibleNames) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  var targets = {};
  for (var i = 0; i < possibleNames.length; i++) {
    targets[normalizeHeader(possibleNames[i])] = true;
  }

  var cols = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").trim();
    if (!h) continue;
    var nh = normalizeHeader(h);
    if (targets[nh]) cols.push(c + 1); // 1-indexed
  }
  return cols;
}

function firstNonEmptyFromCols(rowValues, colNumbers) {
  if (!colNumbers || colNumbers.length === 0) return "";
  for (var i = 0; i < colNumbers.length; i++) {
    var idx = colNumbers[i] - 1;
    if (idx < 0 || idx >= rowValues.length) continue;
    var v = rowValues[idx];
    if (v === null || v === undefined) continue;
    var s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function preferredStatusFromCols(rowValues, statusCols) {
  if (!statusCols || statusCols.length === 0) return "";
  var firstNonEmpty = "";
  var hasIn = false;
  for (var i = 0; i < statusCols.length; i++) {
    var idx = statusCols[i] - 1;
    if (idx < 0 || idx >= rowValues.length) continue;
    var raw = String(rowValues[idx] || "").trim();
    if (!firstNonEmpty && raw) firstNonEmpty = raw;
    var up = raw.toUpperCase();
    if (up === "ATTENDED") return "ATTENDED";
    if (up === "IN") hasIn = true;
  }
  if (hasIn) return "IN";
  return firstNonEmpty;
}

function preferredDateValueFromCols(rowValues, dateCols) {
  if (!dateCols || dateCols.length === 0) return "";
  var firstNonEmpty = "";
  for (var i = 0; i < dateCols.length; i++) {
    var idx = dateCols[i] - 1;
    if (idx < 0 || idx >= rowValues.length) continue;
    var v = rowValues[idx];
    if (v === null || v === undefined || v === "") continue;
    if (!firstNonEmpty) firstNonEmpty = v;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    var d = new Date(v);
    if (!isNaN(d.getTime())) return v;
  }
  return firstNonEmpty;
}

function extractFullName(rowValues, cols) {
  // 1. Try to find and combine split names first (Priority)
  var givenCol = findColumn(cols, ["GIVEN NAME", "First Name", "Givenname", "Given Name"]);
  var middleCol = findColumn(cols, ["MIDDLE NAME", "Middlename", "Middle Name", "M.I.", "Initial"]);
  var familyCol = findColumn(cols, ["FAMILY NAME", "Last Name", "Surname", "Familyname", "Family Name"]);

  var parts = [];
  if (givenCol !== -1) parts.push(String(rowValues[givenCol - 1] || "").trim());
  if (middleCol !== -1) parts.push(String(rowValues[middleCol - 1] || "").trim());
  if (familyCol !== -1) parts.push(String(rowValues[familyCol - 1] || "").trim());

  var combined = parts.filter(Boolean).join(" ");
  if (combined) return combined;

  // 2. Fallback to single Full Name column only if split names are missing
  var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name", "Complete Name"]);
  if (nameCol !== -1) {
    return String(rowValues[nameCol - 1] || "").trim();
  }

  return "";
}


// ==========================================
//  3. REGISTRATION (Form Submit Trigger)
// ==========================================

/**
 * Run this function ONCE from the Apps Script editor to 
 * automatically set up the Form Submit trigger with correct permissions.
 */
function sendEmailForActiveRow() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var row = sheet.getActiveRange().getRow();
  var config = getSettings();

  if (row <= 1) {
    SpreadsheetApp.getUi().alert("Please select a valid data row.");
    return;
  }

  var result = processAndSendRegistrationEmail(sheet, row, config);

  SpreadsheetApp.getUi().alert(
    result.success 
      ? "✅ Email sent successfully!" 
      : "❌ Failed: " + result.error
  );
}

function onFormSubmit(e) {
  if (!e || !e.range) return;

  var config = getSettings();
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  
  // جلوگیری duplicate sending
  var existingStatus = emailStatusCol !== -1 
  ? String(sheet.getRange(row, emailStatusCol).getValue() || "") 
  : "";

  if (existingStatus.indexOf("VERIFIED SENT") !== -1) {
  Logger.log("Skipping already sent row " + row);
  return { success: false, error: "Already sent" };
}
  // Use the shared registration logic  
  processAndSendRegistrationEmail(sheet, row, config);
  
}

/**
 * Shared logic to generate ID and send the registration/QR email.
 * This can be called from onFormSubmit OR manually from the app.
 */
function processAndSendRegistrationEmail(sheet, row, config) {
  var emailError = "";
  var emailSuccess = false;
  var idPdfBlob = null;
  var idPdfUrl = null;
  
  var cols = getColumnMap(sheet);
  var rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

  var name = extractFullName(rowValues, cols);
  var emailCol = findColumn(cols, ["Email Address", "Email", "email address", "email"]);
  var chapterCol = findColumn(cols, ["Chapter", "PAMET Chapter", "Local Chapter", "30TH PAMET NATIONAL", "Branch"]);

  // Extract separate parts for the ID template
  var givenCol = findColumn(cols, ["GIVEN NAME", "First Name", "Givenname", "Given Name"]);
  var middleCol = findColumn(cols, ["MIDDLE NAME", "Middlename", "Middle Name", "M.I.", "Initial"]);
  var familyCol = findColumn(cols, ["FAMILY NAME", "Last Name", "Surname", "Familyname", "Family Name"]);

  var givenName = givenCol !== -1 ? String(rowValues[givenCol - 1] || "").trim() : "";
  var middleName = middleCol !== -1 ? String(rowValues[middleCol - 1] || "").trim() : "";
  var familyName = familyCol !== -1 ? String(rowValues[familyCol - 1] || "").trim() : "";

  if (!name || emailCol === -1) {
    Logger.log("ERROR: Could not find Name or Email for row " + row);
    return false;
  }

  var email = String(sheet.getRange(row, emailCol).getValue() || "").trim();
  var chapter = chapterCol !== -1 ? String(sheet.getRange(row, chapterCol).getValue() || "").trim() : " ";

  if (!name || !email) {
    Logger.log("ERROR: Name or Email is empty at row " + row);
    return false;
  }

  // Get or Generate unique ID
  var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID", "CertID"]);
  if (certIdCol === -1) {
    certIdCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, certIdCol).setValue("CERT_ID");
  }
  var certId = String(sheet.getRange(row, certIdCol).getValue() || "").trim();
  if (!certId) {
    certId = "CERT-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    sheet.getRange(row, certIdCol).setValue(certId);
  }

  var qrData = name + " | " + certId;
  var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent(qrData);

  // Ensure tracking columns exist
  var statusCol = findColumn(cols, ["STATUS", "Status", "Attendance Status"]);
  var emailSentToCol = findColumn(cols, ["EMAIL_SENT_TO", "Email Sent To"]);
  var emailSentAtCol = findColumn(cols, ["EMAIL_SENT_AT", "Email Sent At"]);
  var emailStatusCol = findColumn(cols, ["EMAIL_STATUS", "Email Status"]);

  if (statusCol === -1) {
    statusCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, statusCol).setValue("STATUS");
  }
  if (emailSentToCol === -1) {
    emailSentToCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, emailSentToCol).setValue("EMAIL_SENT_TO");
  }
  if (emailSentAtCol === -1) {
    emailSentAtCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, emailSentAtCol).setValue("EMAIL_SENT_AT");
  }
  if (emailStatusCol === -1) {
    emailStatusCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, emailStatusCol).setValue("EMAIL_STATUS");
  }

  // Get branding from settings
  var eventName = config.EVENT_NAME || "Event";
  var orgName = config.ORG_NAME || "";
  var primaryColor = config.PRIMARY_COLOR || "#00FF00";

  // Generate ID if configured
  var idTemplateId = config.ID_TEMPLATE_ID || config.ID_TEMPLATE || config["PAMET ID Template."];
  var idPdfBlob = null;
  var idPdfUrl = null;
  var idGenError = ""; // Store the exact error

  if (idTemplateId && idTemplateId.indexOf("PASTE_") === -1) {
    try {
      var issueDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      var idResult = generateDocument(name, chapter, email, config, issueDate, certId, "ID", idTemplateId, givenName, middleName, familyName);
      if (idResult && idResult.pdfBlob && idResult.pdfBlob.getBytes().length > 0) {
        idPdfBlob = idResult.pdfBlob;
        idPdfUrl = idResult.pdfUrl;
        Logger.log("✅ ID PDF generated successfully for " + name);
      } else {
        emailError = "ID generation returned no file. Check your FOLDER_ID.";
        Logger.log("⚠️ " + emailError);
      }
    } catch (idErr) {
      idGenError = String(idErr); // Capture the exact error!
      Logger.log("Failed to generate ID: " + idErr);
    }
  }

  // Send QR email
  var emailSuccess = false;
  var emailError = "";
  try {
    var htmlBody = '<!DOCTYPE html><html><head>'
      + '<meta name="color-scheme" content="light dark">'
      + '<meta name="supported-color-schemes" content="light dark">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      + '<style>'
      + ':root { color-scheme: light dark; supported-color-schemes: light dark; } '
      + '.darkmode-white { color: #fffffe !important; -webkit-text-fill-color: #fffffe !important; } '
      + '.darkmode-dark { color: #333333 !important; -webkit-text-fill-color: #333333 !important; } '
      + '.darkmode-gray { color: #555555 !important; -webkit-text-fill-color: #555555 !important; } '
      + '.darkmode-bg { background-color: #fcfcfc !important; } '
      + '@media only screen and (max-width: 600px) { '
      + '  .responsive-td { display: block !important; width: 100% !important; border-left: none !important; border-top: 1px solid #eeeeee !important; padding: 30px 20px !important; box-sizing: border-box !important; } '
      + '  .responsive-td-left { padding: 30px 20px !important; box-sizing: border-box !important; } '
      + '  .mobile-black { color: #000000 !important; -webkit-text-fill-color: #000000 !important; text-shadow: none !important; mix-blend-mode: normal !important; text-align: center !important; } '
      + '} '
      + '</style></head><body style="margin:0;padding:0;background-color:#f4f4f4;">'
      + '<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 30px 20px;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #ddd; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">'
      + '<tr>'
      + '<td colspan="2" style="background: linear-gradient(135deg, ' + primaryColor + ', #333); padding: 25px 30px; text-align: center;">'
      + '<h2 class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 0.5px; text-align: center;">' + eventName + '</h2>'
      + (orgName ? '<p class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 8px 0 0 0; font-size: 14px; opacity: 0.95; text-align: center;">' + orgName + '</p>' : '')
      + '</td>'
      + '</tr>'
      + '<tr>'
      + '<td width="55%" class="responsive-td responsive-td-left" style="padding: 40px 30px; vertical-align: middle;">'
      + '<h3 class="darkmode-dark" style="color: #333333; margin-top: 0; font-size: 22px;">Registration Confirmed!</h3>'
      + '<p class="darkmode-gray" style="color: #555555; font-size: 15px; line-height: 1.6;">Hello <strong>' + name + '</strong>,</p>'
      + '<p class="darkmode-gray" style="color: #555555; font-size: 15px; line-height: 1.6;">You are successfully registered. Please present the QR code at the entrance of the event for quick check-in.</p>'
      + '<div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout: fixed; margin: 0 auto;">'
      + '<tr>'
      + '<td width="50%" align="center" style="padding-bottom: 4px; text-align: center;"><strong class="darkmode-dark" style="color:#333; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">Attendee</strong></td>'
      + '<td width="50%" align="center" style="padding-bottom: 4px; text-align: center;"><strong class="darkmode-dark" style="color:#333; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">Certificate ID</strong></td>'
      + '</tr>'
      + '<tr>'
      + '<td align="center" style="padding-top: 4px; text-align: center; vertical-align: top;"><span class="darkmode-gray" style="color:#555; font-size:15px; word-break: break-word;">' + name + '</span></td>'
      + '<td align="center" style="padding-top: 4px; text-align: center; vertical-align: top;"><span class="darkmode-gray" style="color:#555; font-size:15px; word-break: break-all;">' + certId + '</span></td>'
      + '</tr>'
      + '</table>'
      + '</div>'
      + '</td>'
      + '<td width="45%" class="darkmode-bg responsive-td" style="padding: 40px 30px; text-align: center; vertical-align: middle; background-color: #fcfcfc; border-left: 1px solid #eeeeee;">'
      + '<div style="background: #ffffff; padding: 15px; display: inline-block; border-radius: 12px; border: 1px solid #ddd; box-shadow: 0 4px 10px rgba(0,0,0,0.03);">'
      + '<img src="' + qrUrl + '" width="180" height="180" style="margin: 0; display: block;" alt="QR Code" />'
      + '</div>'
      + '<p class="darkmode-gray" style="color: #888888; font-size: 12px; margin-top: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">Ready to Scan</p>'
      + (idPdfUrl ? '<a href="' + idPdfUrl + '" style="display:inline-block; margin-top:15px; padding:10px 15px; background:' + primaryColor + '; color:#fff; text-decoration:none; border-radius:6px; font-size:12px; font-weight:bold;">Download ID Card</a>' : '')
      + '</td>'
      + '</tr>'
      + '<tr>'
      + '<td colspan="2" style="background: linear-gradient(135deg, ' + primaryColor + ', ' + primaryColor + '); padding: 15px 30px; text-align: center;">'
      + '<p class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 0; font-size: 12px; opacity: 0.95; text-align: center;">' + eventName + '</p>'
      + '</td>'
      + '</tr>'
      + '</table>'
      + '</div></body></html>';

    var emailOptions = {
      htmlBody: htmlBody,
      name: eventName
    };
    // Note: PDF attachment removed per user request. Download link is still in the HTML body.
    GmailApp.sendEmail(email, "Your QR Code - " + eventName, "", emailOptions);
    emailSuccess = true;
    Logger.log("QR email sent to: " + email + " at row " + row);
  } catch (err) {
    emailError = String(err);
    Logger.log("Email error at row " + row + ": " + err);
  }

  // Update sheet
  var statusMessage = emailSuccess ? "QR SENT" : "EMAIL FAILED";
  var detailMessage = emailSuccess ? "VERIFIED SENT to " + email : "FAILED: " + emailError;
  
  // If PDF generation failed, append the exact error to the detail message
  if (idGenError) {
    detailMessage += " | PDF FAILED: " + idGenError;
    statusMessage = "QR SENT (NO PDF)";
  }

  sheet.getRange(row, statusCol).setValue(statusMessage);
  sheet.getRange(row, emailSentToCol).setValue(emailSuccess ? email : "");
  sheet.getRange(row, emailSentAtCol).setValue(emailSuccess ? new Date() : "");
  sheet.getRange(row, emailStatusCol).setValue(detailMessage);

  // Return results for debugging
  return { 
    success: emailSuccess, 
    error: emailError, 
    templateFound: !!idTemplateId,
    pdfSize: idPdfBlob ? idPdfBlob.getBytes().length : 0,
    debug: "Error Details: " + (idGenError || "None") 
  };
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
    var emailCol = findColumn(cols, ["Email Address", "Email"]);
    var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID"]);

    // Handle duplicate headers safely (STATUS / SCAN_TIME can appear multiple times)
    var statusCols = findAllColumnsByHeaderNames(sheet, ["STATUS", "Status", "Attendance Status"]);
    var scanTimeCols = findAllColumnsByHeaderNames(sheet, ["SCAN_TIME", "Scan Time", "Check-in Time", "Check in Time"]);
    var statusOutCols = findAllColumnsByHeaderNames(sheet, ["STATUS_OUT", "Status Out"]);
    var scanTimeOutCols = findAllColumnsByHeaderNames(sheet, ["SCAN_TIME_OUT", "Scan Time Out"]);
    var emailSentToCol = findColumn(cols, ["EMAIL_SENT_TO", "Email Sent To"]);
    var emailSentAtCol = findColumn(cols, ["EMAIL_SENT_AT", "Email Sent At"]);
    var emailStatusCol = findColumn(cols, ["EMAIL_STATUS", "Email Status"]);
    var proofOfPaymentCol = findColumn(cols, ["Proof of Payment", "Upload", "Receipt", "Payment Proof", "Attachment", "proof of payment"]);

    var values = sheet.getDataRange().getValues();
    var backgrounds = sheet.getDataRange().getBackgrounds();
    var registeredList = [];
    var attendedList = [];

    for (var i = 1; i < values.length; i++) {
      var name = extractFullName(values[i], cols);
      var email = emailCol > 0 ? String(values[i][emailCol - 1] || "").trim() : "";
      var certId = certIdCol > 0 ? String(values[i][certIdCol - 1] || "").trim() : "";
      var status = preferredStatusFromCols(values[i], statusCols);
      var scanTime = preferredDateValueFromCols(values[i], scanTimeCols);
      var statusOut = firstNonEmptyFromCols(values[i], statusOutCols);
      var scanTimeOut = preferredDateValueFromCols(values[i], scanTimeOutCols);
      var emailSentTo = emailSentToCol > 0 ? String(values[i][emailSentToCol - 1] || "").trim() : "";
      var emailSentAt = emailSentAtCol > 0 ? values[i][emailSentAtCol - 1] : "";
      var emailStatus = emailStatusCol > 0 ? String(values[i][emailStatusCol - 1] || "").trim() : "";
      var proofOfPayment = proofOfPaymentCol > 0 ? String(values[i][proofOfPaymentCol - 1] || "").trim() : "";

      // Highlight Detection (Green background = Validated)
      var isHighlighted = false;
      var rowBgs = backgrounds[i];
      for (var colIdx = 0; colIdx < Math.min(rowBgs.length, 10); colIdx++) {
        var cellBg = rowBgs[colIdx].toLowerCase();
        if (cellBg === "#ffffff" || cellBg === "white" || cellBg === "transparent" || cellBg === "rgba(0,0,0,0)") continue;
        if (cellBg.indexOf('#') === 0 && cellBg.length === 7) {
          var r = parseInt(cellBg.slice(1, 3), 16);
          var g = parseInt(cellBg.slice(3, 5), 16);
          var b = parseInt(cellBg.slice(5, 7), 16);
          if (g > r && g > b) { isHighlighted = true; break; }
        } else if (cellBg.includes("green")) {
          isHighlighted = true;
          break;
        }
      }

      if (!name || !certId) continue; // Skip empty rows or rows without IDs

      // Include if they have a name and ID, OR if they have a registered status
      var statusStr = String(status).trim().toUpperCase();
      var isRegisteredStatus = (statusStr === "IMPORTED" || statusStr === "QR SENT" || statusStr === "ATTENDED" || statusStr === "IN" || statusStr === "OUT" || certId !== "");
      var isCheckedIn = (statusStr === "ATTENDED" || statusStr === "IN");

      if (isRegisteredStatus) {
        registeredList.push({
          name: name,
          email: email,
          certId: certId,
          status: status,
          statusOut: statusOut,
          scanTimeOut: safeToISOString(scanTimeOut),
          emailSentTo: emailSentTo,
          emailSentAt: safeToISOString(emailSentAt),
          emailStatus: emailStatus,
          proofOfPayment: proofOfPayment || "NOT PAID",
          isHighlighted: isHighlighted
        });
      }

      if (isCheckedIn) {
        attendedList.push({
          name: name,
          email: email,
          certId: certId,
          scanTime: safeToISOString(scanTime),
          statusOut: statusOut,
          scanTimeOut: safeToISOString(scanTimeOut),
          proofOfPayment: proofOfPayment || "NOT PAID"
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
  // Use LockService to prevent concurrent writes from simultaneous scan requests
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Wait up to 10s for the lock
  } catch (lockErr) {
    return createJsonResponse({ success: false, message: "Server busy, please try again", name: "" });
  }

  try {
    var config = getSettings();
    var data = JSON.parse(e.postData.contents);
    var qrContent = data.qrContent;
    var action = data.action;

    // ---- Approve Payment (Mark as Cash Paid Onsite) ----
    if (action === "approvePayment") {
      var certIdForPayment = (data.certId || "").toString().trim();
      if (!certIdForPayment) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "certId is required", name: "" });
      }

      var ssPay = SpreadsheetApp.getActiveSpreadsheet();
      var sheetTabPay = config.REG_SHEET_TAB || "Form Responses 1";
      var sheetPay = ssPay.getSheetByName(sheetTabPay);
      if (!sheetPay) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Sheet not found", name: "" });
      }

      var colsPay = getColumnMap(sheetPay);
      var nameColPay = findColumn(colsPay, ["Full Name", "Fullname", "Name", "Complete Name"]);
      var certIdColPay = findColumn(colsPay, ["CERT_ID", "Certificate ID"]);
      var proofOfPaymentColPay = findColumn(colsPay, ["Proof of Payment", "Upload", "Receipt", "Payment Proof", "Attachment", "proof of payment"]);

      if (certIdColPay === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "CERT_ID column not found", name: "" });
      }
      if (proofOfPaymentColPay === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Proof of Payment column not found", name: "" });
      }

      var valuesPay = sheetPay.getDataRange().getValues();
      var foundPay = false;
      var attendeeNamePay = "";

      for (var i = 1; i < valuesPay.length; i++) {
        var rowCertIdPay = String(valuesPay[i][certIdColPay - 1] || "").trim();
        if (rowCertIdPay && rowCertIdPay === certIdForPayment) {
          sheetPay.getRange(i + 1, proofOfPaymentColPay).setValue("CASH PAID ONSITE");
          SpreadsheetApp.flush();
          attendeeNamePay = extractFullName(valuesPay[i], colsPay);
          foundPay = true;
          Logger.log("Marked CASH PAID ONSITE for: " + attendeeNamePay + " (" + rowCertIdPay + ")");
          break;
        }
      }

      lock.releaseLock();
      if (foundPay) {
        return createJsonResponse({ success: true, message: "Payment marked as paid (cash onsite)", name: attendeeNamePay });
      } else {
        return createJsonResponse({ success: false, message: "Attendee not found for CERT_ID: " + certIdForPayment, name: "" });
      }
    }

    // ---- Revoke Payment (Mark as Not Paid) ----
    if (action === "revokePayment") {
      var certIdForRevoke = (data.certId || "").toString().trim();
      if (!certIdForRevoke) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "certId is required", name: "" });
      }

      var ssRev = SpreadsheetApp.getActiveSpreadsheet();
      var sheetTabRev = config.REG_SHEET_TAB || "Form Responses 1";
      var sheetRev = ssRev.getSheetByName(sheetTabRev);
      if (!sheetRev) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Sheet not found", name: "" });
      }

      var colsRev = getColumnMap(sheetRev);
      var certIdColRev = findColumn(colsRev, ["CERT_ID", "Certificate ID"]);
      var proofOfPaymentColRev = findColumn(colsRev, ["Proof of Payment", "Upload", "Receipt", "Payment Proof", "Attachment", "proof of payment"]);

      if (certIdColRev === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "CERT_ID column not found", name: "" });
      }
      if (proofOfPaymentColRev === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Proof of Payment column not found", name: "" });
      }

      var valuesRev = sheetRev.getDataRange().getValues();
      var foundRev = false;

      for (var i = 1; i < valuesRev.length; i++) {
        var rowCertIdRev = String(valuesRev[i][certIdColRev - 1] || "").trim();
        if (rowCertIdRev && rowCertIdRev === certIdForRevoke) {
          sheetRev.getRange(i + 1, proofOfPaymentColRev).setValue("NOT PAID");
          SpreadsheetApp.flush();
          foundRev = true;
          Logger.log("Revoked payment for CERT_ID: " + rowCertIdRev);
          break;
        }
      }

      lock.releaseLock();
      if (foundRev) {
        return createJsonResponse({ success: true, message: "Payment marked as not paid", name: "" });
      } else {
        return createJsonResponse({ success: false, message: "Attendee not found for CERT_ID: " + certIdForRevoke, name: "" });
      }
    }

    // ---- Update Attendance Status (Manual Override from Guest List) ----
    if (action === "updateStatus") {
      var certIdForUpdate = (data.certId || "").toString().trim();
      var newStatus = (data.newStatus || "").toString().trim().toUpperCase(); // NONE | IN | OUT

      if (!certIdForUpdate) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "certId is required", name: "" });
      }
      if (["NONE", "IN", "OUT"].indexOf(newStatus) === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "newStatus must be NONE, IN, or OUT", name: "" });
      }

      var ssUpd = SpreadsheetApp.getActiveSpreadsheet();
      var sheetTabUpd = config.REG_SHEET_TAB || "Form Responses 1";
      var sheetUpd = ssUpd.getSheetByName(sheetTabUpd);
      if (!sheetUpd) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Sheet not found", name: "" });
      }

      var colsUpd = getColumnMap(sheetUpd);
      var certIdColUpd = findColumn(colsUpd, ["CERT_ID", "Certificate ID"]);
      var statusColUpd = findColumn(colsUpd, ["STATUS", "Status", "Attendance Status"]);
      var scanTimeColUpd = findColumn(colsUpd, ["SCAN_TIME", "Scan Time", "Check-in Time"]);
      var statusOutColUpd = findColumn(colsUpd, ["STATUS_OUT", "Status Out"]);
      var scanTimeOutColUpd = findColumn(colsUpd, ["SCAN_TIME_OUT", "Scan Time Out"]);

      if (certIdColUpd === -1 || statusColUpd === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "CERT_ID or STATUS column not found", name: "" });
      }

      var valuesUpd = sheetUpd.getDataRange().getValues();
      var foundUpd = false;
      var attendeeNameUpd = "";

      for (var i = 1; i < valuesUpd.length; i++) {
        var rowCertIdUpd = String(valuesUpd[i][certIdColUpd - 1] || "").trim();
        if (rowCertIdUpd && rowCertIdUpd === certIdForUpdate) {
          foundUpd = true;
          attendeeNameUpd = extractFullName(valuesUpd[i], colsUpd);

          if (newStatus === "NONE") {
            // Clear attendance entirely — reset back to QR SENT
            sheetUpd.getRange(i + 1, statusColUpd).setValue("QR SENT");
            if (scanTimeColUpd > 0)    sheetUpd.getRange(i + 1, scanTimeColUpd).setValue("");
            if (statusOutColUpd > 0)   sheetUpd.getRange(i + 1, statusOutColUpd).setValue("");
            if (scanTimeOutColUpd > 0) sheetUpd.getRange(i + 1, scanTimeOutColUpd).setValue("");

          } else if (newStatus === "IN") {
            // Mark as checked in (morning) only — use ATTENDED to match QR scan behavior
            sheetUpd.getRange(i + 1, statusColUpd).setValue("ATTENDED");
            if (scanTimeColUpd > 0) {
              var existScanTime = valuesUpd[i][scanTimeColUpd - 1];
              if (!existScanTime) sheetUpd.getRange(i + 1, scanTimeColUpd).setValue(new Date());
            }
            if (statusOutColUpd > 0)   sheetUpd.getRange(i + 1, statusOutColUpd).setValue("");
            if (scanTimeOutColUpd > 0) sheetUpd.getRange(i + 1, scanTimeOutColUpd).setValue("");

          } else if (newStatus === "OUT") {
            // Mark as IN & OUT (both sessions done)
            sheetUpd.getRange(i + 1, statusColUpd).setValue("ATTENDED");
            if (scanTimeColUpd > 0) {
              var existScanTimeIn = valuesUpd[i][scanTimeColUpd - 1];
              if (!existScanTimeIn) sheetUpd.getRange(i + 1, scanTimeColUpd).setValue(new Date());
            }
            if (statusOutColUpd > 0) sheetUpd.getRange(i + 1, statusOutColUpd).setValue("OUT");
            if (scanTimeOutColUpd > 0) {
              var existScanTimeOut = valuesUpd[i][scanTimeOutColUpd - 1];
              if (!existScanTimeOut) sheetUpd.getRange(i + 1, scanTimeOutColUpd).setValue(new Date());
            }
          }

          SpreadsheetApp.flush();
          Logger.log("Manual status update → " + newStatus + " for: " + attendeeNameUpd + " (" + rowCertIdUpd + ")");
          break;
        }
      }

      lock.releaseLock();
      if (foundUpd) {
        return createJsonResponse({ success: true, message: "Status updated to " + newStatus, name: attendeeNameUpd });
      } else {
        return createJsonResponse({ success: false, message: "Attendee not found for CERT_ID: " + certIdForUpdate, name: "" });
      }
    }

    // ---- Clear All Attendance Status (Reset All) ----
    if (action === "clearAllStatus") {
      var ssClear = SpreadsheetApp.getActiveSpreadsheet();
      var sheetTabClear = config.REG_SHEET_TAB || "Form Responses 1";
      var sheetClear = ssClear.getSheetByName(sheetTabClear);
      if (!sheetClear) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Sheet not found", name: "" });
      }

      var colsClear = getColumnMap(sheetClear);
      var statusColClear = findColumn(colsClear, ["STATUS", "Status", "Attendance Status"]);
      var scanTimeColClear = findColumn(colsClear, ["SCAN_TIME", "Scan Time", "Check-in Time"]);
      var statusOutColClear = findColumn(colsClear, ["STATUS_OUT", "Status Out"]);
      var scanTimeOutColClear = findColumn(colsClear, ["SCAN_TIME_OUT", "Scan Time Out"]);
      var certIdColClear = findColumn(colsClear, ["CERT_ID", "Certificate ID"]);

      if (statusColClear === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "STATUS column not found", name: "" });
      }

      var lastRow = sheetClear.getLastRow();
      if (lastRow > 1) {
        // We only clear rows that actually have a CERT_ID (valid registrants)
        var valuesClear = sheetClear.getRange(2, 1, lastRow - 1, sheetClear.getLastColumn()).getValues();
        
        // Prepare arrays for batch updating to be much faster than row-by-row
        var statusUpdates = [];
        var clearUpdates = [];
        for (var i = 0; i < lastRow - 1; i++) {
          var hasCert = certIdColClear > 0 && String(valuesClear[i][certIdColClear - 1] || "").trim() !== "";
          statusUpdates.push([hasCert ? "QR SENT" : valuesClear[i][statusColClear - 1]]);
          clearUpdates.push([""]);
        }

        // Apply batch updates
        sheetClear.getRange(2, statusColClear, lastRow - 1, 1).setValues(statusUpdates);
        if (scanTimeColClear > 0) sheetClear.getRange(2, scanTimeColClear, lastRow - 1, 1).setValues(clearUpdates);
        if (statusOutColClear > 0) sheetClear.getRange(2, statusOutColClear, lastRow - 1, 1).setValues(clearUpdates);
        if (scanTimeOutColClear > 0) sheetClear.getRange(2, scanTimeOutColClear, lastRow - 1, 1).setValues(clearUpdates);

        SpreadsheetApp.flush();
      }

      lock.releaseLock();
      Logger.log("Cleared all attendance statuses for all registrants.");
      return createJsonResponse({ success: true, message: "Successfully cleared all attendance data.", name: "" });
    }


    // ---- Send Registration QR/ID to a single attendee ----
    if (action === "sendQrCode") {

      var attendeeEmail = (data.email || "").toString().trim();
      if (!attendeeEmail) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "email is required", name: "" });
      }

      var ssQr = SpreadsheetApp.getActiveSpreadsheet();
      var sheetTabQr = config.REG_SHEET_TAB || "Form Responses 1";
      var sheetQr = ssQr.getSheetByName(sheetTabQr);
      if (!sheetQr) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Sheet not found", name: "" });
      }

      var colsQr = getColumnMap(sheetQr);
      var emailColQr = findColumn(colsQr, ["Email Address", "Email", "email address", "email"]);
      if (emailColQr === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Email column not found", name: "" });
      }

      var valuesQr = sheetQr.getDataRange().getValues();
      var foundQr = false;
      var matchedRowQr = -1;

      for (var i = 1; i < valuesQr.length; i++) {
        var rowEmailQr = String(valuesQr[i][emailColQr - 1] || "").trim().toLowerCase();
        if (rowEmailQr === attendeeEmail.toLowerCase()) {
          foundQr = true;
          matchedRowQr = i + 1;
          break;
        }
      }

      if (!foundQr) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Attendee not found with email: " + attendeeEmail, name: "" });
      }

      try {
        var result = processAndSendRegistrationEmail(sheetQr, matchedRowQr, config);
        lock.releaseLock();
        
        var debugInfo = " [ID: " + (result.templateFound ? "YES" : "NO") + ", PDF: " + (result.pdfSize || 0) + "b, Status: " + result.debug + "]";
        
        return createJsonResponse({ 
          success: result.success, 
          message: (result.success ? "Email sent successfully!" : "Error: " + result.error) + debugInfo, 
          name: attendeeEmail 
        });
      } catch (err) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "System error: " + err, name: attendeeEmail });
      }
    }

    // ---- Send Certificate to a single attendee ----
    if (action === "sendCertificate") {
      var certEmail = (data.email || "").toString().trim();
      var certName = (data.name || "").toString().trim();

      if (!certEmail) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "email is required", name: "" });
      }

      var ssCert = SpreadsheetApp.getActiveSpreadsheet();
      var sheetTabCert = config.REG_SHEET_TAB || "Form Responses 1";
      var sheetCert = ssCert.getSheetByName(sheetTabCert);
      if (!sheetCert) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Sheet not found", name: "" });
      }

      var colsCert = getColumnMap(sheetCert);
      var nameColCert = findColumn(colsCert, ["Full Name", "Fullname", "Name", "Complete Name"]);
      var emailColCert = findColumn(colsCert, ["Email Address", "Email", "email address", "email"]);
      var chapterColCert = findColumn(colsCert, ["Chapter", "PAMET Chapter", "Local Chapter", "30TH PAMET NATIONAL", "Branch"]);
      var statusColsCert = findAllColumnsByHeaderNames(sheetCert, ["STATUS", "Status", "Attendance Status"]);

      // Find or create CERT_SENT column
      var certSentCol = findColumn(colsCert, ["CERT_SENT", "Certificate Sent"]);
      if (certSentCol === -1) {
        certSentCol = sheetCert.getLastColumn() + 1;
        sheetCert.getRange(1, certSentCol).setValue("CERT_SENT");
      }

      if (emailColCert === -1) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Email column not found", name: "" });
      }

      var valuesCert = sheetCert.getDataRange().getValues();
      var foundCert = false;
      var attendeeNameCert = certName;
      var matchedRow = -1;

      for (var i = 1; i < valuesCert.length; i++) {
        var rowEmail = emailColCert > 0 ? String(valuesCert[i][emailColCert - 1] || "").trim().toLowerCase() : "";
        if (rowEmail === certEmail.toLowerCase()) {
          foundCert = true;
          matchedRow = i + 1;
          if (!attendeeNameCert) {
            attendeeNameCert = extractFullName(valuesCert[i], colsCert);
          }
          var attendeeChapterCert = chapterColCert > 0 ? String(valuesCert[i][chapterColCert - 1] || "").trim() : " ";

          // 1. Check attendance status
          var attendStatus = preferredStatusFromCols(valuesCert[i], statusColsCert).toUpperCase();
          if (attendStatus !== "ATTENDED" && attendStatus !== "IN") {
            lock.releaseLock();
            return createJsonResponse({ success: false, message: "Not attended", name: attendeeNameCert });
          }

          // 2. Check Evaluation Status (Requirement)
          var evalSheetId = config.EVAL_SHEET_ID || "";
          if (evalSheetId && evalSheetId.indexOf("PASTE_") === -1) {
            var isEvalDone = checkEvaluationStatus(certEmail, evalSheetId);
            if (!isEvalDone) {
              lock.releaseLock();
              return createJsonResponse({ 
                success: false, 
                message: "Evaluation NOT completed yet. Participant must submit the evaluation form first.", 
                name: attendeeNameCert 
              });
            }
          }

          /* 
          // Check if already sent (Removed to allow manual re-sending)
          var alreadySent = String(valuesCert[i][certSentCol - 1] || "").trim();
          if (alreadySent && alreadySent.indexOf("SENT") !== -1) {
            lock.releaseLock();
            return createJsonResponse({ success: true, message: "Already sent", name: attendeeNameCert });
          }
          */
          break;
        }
      }

      if (!foundCert) {
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Attendee not found: " + certEmail, name: "" });
      }

      // Auto-sync cert settings from eval spreadsheet if TEMPLATE_ID/FOLDER_ID are missing
      if (!config.TEMPLATE_ID && !config.CERT_TEMPLATE_ID && !config["PAMET CERT Template."]) {
        var syncResult = syncCertSettings();
        if (syncResult.success) {
          config = getSettings(); // reload after sync
        }
      }
      var certTemplateId = config.CERT_TEMPLATE_ID || config.TEMPLATE_ID || config["PAMET CERT Template."];
      if (!certTemplateId || !config.FOLDER_ID) {
        lock.releaseLock();
        return createJsonResponse({
          success: false,
          message: "CERT_TEMPLATE_ID or FOLDER_ID missing. Add them to the Settings tab, then retry.",
          name: attendeeNameCert
        });
      }

      // Mark as PROCESSING
      sheetCert.getRange(matchedRow, certSentCol).setValue("PROCESSING...");
      SpreadsheetApp.flush();

      try {
        var certId = "CERT-" + Utilities.getUuid().slice(0, 8).toUpperCase();
        var issueDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        var result = generateDocument(attendeeNameCert, attendeeChapterCert, certEmail, config, issueDate, certId, "Certificate", certTemplateId);
        sendCertificateEmail(certEmail, attendeeNameCert, result.pdfBlob, result.pdfUrl, config);
        sheetCert.getRange(matchedRow, certSentCol).setValue("SENT - " + new Date().toLocaleString());
        SpreadsheetApp.flush();
        lock.releaseLock();
        return createJsonResponse({ success: true, message: "Certificate sent", name: attendeeNameCert });
      } catch (certErr) {
        sheetCert.getRange(matchedRow, certSentCol).setValue("ERROR: " + certErr);
        SpreadsheetApp.flush();
        lock.releaseLock();
        return createJsonResponse({ success: false, message: "Certificate error: " + certErr, name: attendeeNameCert });
      }
    }

    // ---- Default: Mark attendance (QR scan) ----
    Logger.log("Scan received: " + qrContent);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTab = config.REG_SHEET_TAB || "Form Responses 1";
    var sheet = ss.getSheetByName(sheetTab);

    if (!sheet) {
      lock.releaseLock();
      return createJsonResponse({ success: false, message: "Sheet not found", name: "" });
    }

    var cols = getColumnMap(sheet);
    var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name", "Complete Name"]);
    var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID"]);
    var proofOfPaymentCol = findColumn(cols, ["Proof of Payment", "Upload", "Receipt", "Payment Proof", "Attachment", "proof of payment"]);

    // Detect all matching columns (handles duplicate headers safely)
    var statusCols = findAllColumnsByHeaderNames(sheet, ["STATUS", "Status", "Attendance Status"]);
    var scanTimeCols = findAllColumnsByHeaderNames(sheet, ["SCAN_TIME", "Scan Time", "Check-in Time", "Check in Time"]);
    var statusOutCols = findAllColumnsByHeaderNames(sheet, ["STATUS_OUT", "Status Out"]);
    var scanTimeOutCols = findAllColumnsByHeaderNames(sheet, ["SCAN_TIME_OUT", "Scan Time Out"]);

    // Create missing columns exactly once (avoid creating duplicates)
    if (statusCols.length === 0) {
      var newStatusCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newStatusCol).setValue("STATUS");
      statusCols = [newStatusCol];
    }
    if (scanTimeCols.length === 0) {
      var newScanTimeCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newScanTimeCol).setValue("SCAN_TIME");
      scanTimeCols = [newScanTimeCol];
    }
    if (statusOutCols.length === 0) {
      var newStatusOutCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newStatusOutCol).setValue("STATUS_OUT");
      statusOutCols = [newStatusOutCol];
    }
    if (scanTimeOutCols.length === 0) {
      var newScanTimeOutCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newScanTimeOutCol).setValue("SCAN_TIME_OUT");
      scanTimeOutCols = [newScanTimeOutCol];
    }

    if (certIdCol === -1) {
      lock.releaseLock();
      return createJsonResponse({ success: false, message: "CERT_ID column not found", name: "" });
    }

    // Re-read fresh data while holding the lock to avoid race conditions
    var values = sheet.getDataRange().getValues();
    var found = false;
    var message = "";
    var attendeeName = "";
    var attendeePayment = "NOT PAID";
    var scanType = ""; // "IN" or "OUT"

    for (var i = 1; i < values.length; i++) {
      var rowCertId = String(values[i][certIdCol - 1] || "").trim();
      var rowName = extractFullName(values[i], cols);

      if (rowCertId && qrContent.includes(rowCertId)) {
        found = true;
        attendeeName = rowName;
        var rowPayment = proofOfPaymentCol > 0 ? String(values[i][proofOfPaymentCol - 1] || "").trim() : "";
        attendeePayment = rowPayment || "NOT PAID";

        var currentStatus = preferredStatusFromCols(values[i], statusCols).toUpperCase();
        var currentStatusOut = firstNonEmptyFromCols(values[i], statusOutCols).toUpperCase();

        if ((currentStatus === "ATTENDED" || currentStatus === "IN") && currentStatusOut === "OUT") {
          // Already fully checked in (both morning and afternoon done)
          message = "Already fully checked in: " + rowName;
        } else if (currentStatus === "ATTENDED" || currentStatus === "IN") {
          // Morning done, this is the afternoon scan → mark OUT
          for (var so = 0; so < statusOutCols.length; so++) {
            sheet.getRange(i + 1, statusOutCols[so]).setValue("OUT");
          }
          for (var sto = 0; sto < scanTimeOutCols.length; sto++) {
            sheet.getRange(i + 1, scanTimeOutCols[sto]).setValue(new Date());
          }
          SpreadsheetApp.flush();
          message = "Welcome back, " + rowName + "!";
          scanType = "OUT";
          Logger.log("Marked OUT (afternoon): " + rowName);
        } else {
          // First scan → mark ATTENDED (morning)
          for (var sc = 0; sc < statusCols.length; sc++) {
            sheet.getRange(i + 1, statusCols[sc]).setValue("ATTENDED");
          }
          for (var st = 0; st < scanTimeCols.length; st++) {
            sheet.getRange(i + 1, scanTimeCols[st]).setValue(new Date());
          }
          SpreadsheetApp.flush();
          message = "Welcome, " + rowName + "!";
          scanType = "IN";
          Logger.log("Marked ATTENDED (morning): " + rowName);
        }
        break;
      }
    }

    if (!found) {
      message = "QR Code not recognized";
      Logger.log("No match for: " + qrContent);
    }

    lock.releaseLock();
    return createJsonResponse({ success: found && message.startsWith("Welcome"), message: message, name: attendeeName, proofOfPayment: attendeePayment, scanType: scanType });

  } catch (error) {
    lock.releaseLock();
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


// Safely convert a Sheets date/time cell (or string) to ISO8601.
// If the value cannot be parsed as a valid Date, return the original
// string representation instead of throwing a RangeError.
function safeToISOString(value) {
  if (!value) return "";
  try {
    var d = value instanceof Date ? value : new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch (e) {
    // fall through
  }
  return String(value);
}


// ==========================================
//  SETTINGS HELPERS
// ==========================================

// Write or update a single key-value pair in the Settings tab.
function updateSetting(key, value) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Settings");
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || "").trim() === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        SpreadsheetApp.flush();
        Logger.log("Settings updated: " + key + " = " + value);
        return;
      }
    }
    // Key not found — append a new row
    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1).setValue(key);
    sheet.getRange(newRow, 2).setValue(value);
    SpreadsheetApp.flush();
    Logger.log("Settings added: " + key + " = " + value);
  } catch (e) {
    Logger.log("updateSetting error: " + e);
  }
}

// Read TEMPLATE_ID and FOLDER_ID from the linked EVAL_SHEET_ID spreadsheet
// and write them into the local Settings tab. Returns { success, message }.
// Run this manually from the Apps Script editor if cert sending keeps failing.
function syncCertSettings() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Settings");
    if (!sheet) return { success: false, message: "Settings tab not found" };

    // Read all local settings
    var data = sheet.getDataRange().getValues();
    var localConfig = {};
    var keyToRow = {};
    for (var i = 1; i < data.length; i++) {
      var k = String(data[i][0] || "").trim();
      if (k) {
        localConfig[k] = String(data[i][1] || "").trim();
        keyToRow[k] = i + 1;
      }
    }

    var evalSheetId = localConfig.EVAL_SHEET_ID || "";
    if (!evalSheetId || evalSheetId.indexOf("PASTE_") === 0) {
      return { success: false, message: "EVAL_SHEET_ID not configured in Settings tab" };
    }

    // Open the evaluation spreadsheet
    var evalSS = SpreadsheetApp.openById(evalSheetId);
    var evalSettings = evalSS.getSheetByName("Settings");
    if (!evalSettings) {
      return { success: false, message: "No Settings tab found in evaluation spreadsheet" };
    }

    var evalData = evalSettings.getDataRange().getValues();
    var evalConfig = {};
    for (var i = 1; i < evalData.length; i++) {
      var k = String(evalData[i][0] || "").trim();
      var v = String(evalData[i][1] || "").trim();
      if (k && v) evalConfig[k] = v;
    }

    var updated = [];
    var keysToSync = ["TEMPLATE_ID", "FOLDER_ID"];
    for (var ki = 0; ki < keysToSync.length; ki++) {
      var key = keysToSync[ki];
      var val = evalConfig[key];
      if (!val) continue;
      if (keyToRow[key]) {
        sheet.getRange(keyToRow[key], 2).setValue(val);
      } else {
        var newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1).setValue(key);
        sheet.getRange(newRow, 2).setValue(val);
      }
      updated.push(key + "=" + val.substring(0, 12) + "...");
    }

    SpreadsheetApp.flush();
    var msg = updated.length > 0
      ? "Synced: " + updated.join(", ")
      : "Nothing to sync (TEMPLATE_ID/FOLDER_ID not found in eval spreadsheet)";
    Logger.log("syncCertSettings: " + msg);
    return { success: updated.length > 0, message: msg };

  } catch (err) {
    Logger.log("syncCertSettings error: " + err);
    return { success: false, message: "syncCertSettings error: " + err };
  }
}


// ==========================================
//  CERTIFICATE GENERATION (ported from evaluation.gs)
// ==========================================

function generateDocument(name, chapter, email, config, issueDate, certId, docType, templateId, givenName, middleName, familyName) {
  var eventName = config.EVENT_NAME || "Event";
  var eventDate = config.EVENT_DATE || issueDate;
  var eventLocation = config.EVENT_LOCATION || "";

  name = name || "Unknown";
  email = email || "unknown@email.com";
  chapter = chapter || " ";
  docType = docType || "Document";
  
  givenName = givenName || "";
  middleName = middleName || "";
  familyName = familyName || "";

  // Create a multi-line version for the ID as requested: 
  // Line 1: Family
  // Line 2: Given Middle
  var multiLineName = familyName + "\n" + givenName + (middleName ? " " + middleName : "");

  Logger.log("Generating " + docType + " for: " + name);

  // 1. Get or create the output folder — fall back to a new root folder if inaccessible
  var mainFolder;
  try {
    mainFolder = DriveApp.getFolderById(config.FOLDER_ID);
    // Verify we can actually write to it
    mainFolder.getName();
  } catch (folderErr) {
    Logger.log("FOLDER_ID inaccessible (" + folderErr + ") — creating fallback folder in root Drive");
    var fallbackName = (eventName || "Certificates") + " - " + docType + "s";
    mainFolder = DriveApp.createFolder(fallbackName);
    mainFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    // Save the new folder ID back to Settings so future runs reuse it
    updateSetting("FOLDER_ID", mainFolder.getId());
    Logger.log("Fallback folder created: " + mainFolder.getId());
  }

  var participantFolder = mainFolder;
  var docName = name + " - " + certId + " - " + docType;

  // 2. Fetch the template
  var template;
  try {
    template = DriveApp.getFileById(templateId);
    template.getName(); 
  } catch (tmplErr) {
    throw new Error("Cannot access " + docType + " template ID (" + templateId + "): " + tmplErr);
  }
  
  var mimeType = template.getMimeType();
  var isSlides = (mimeType === "application/vnd.google-apps.presentation");

  // Create the temporary copy in the PRIVATE Root folder (invisible to participants)
  var copy = template.makeCopy(docName, DriveApp.getRootFolder());
  var copyId = copy.getId();

  // Small delay to ensure the copy is fully ready in Drive
  Utilities.sleep(500);

  Logger.log("Template type: " + (isSlides ? "Google Slides" : "Google Docs"));

  // 3. Replace placeholders
  if (isSlides) {
    var presentation = SlidesApp.openById(copyId);
    var nameStr = String(name || "");
    var chapStr = String(chapter || "");

    // Auto-scale long names to fit in the text box
    function replaceAndScaleName(elements, tags, replacement) {
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (element.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
          var shape = element.asShape();
          try {
            var textRange = shape.getText();
            var text = textRange.asString();
            var hasTag = false;
            for (var t = 0; t < tags.length; t++) {
              if (text.indexOf(tags[t]) !== -1) {
                hasTag = true;
                break;
              }
            }
            if (hasTag) {
              var originalSize = textRange.getTextStyle().getFontSize() || 24;
              for (var t = 0; t < tags.length; t++) {
                textRange.replaceAllText(tags[t], replacement);
              }
              if (replacement.length > 18) {
                 var scaleFactor = 19 / replacement.length; 
                 var newSize = Math.max(10, Math.floor(originalSize * scaleFactor));
                 textRange.getTextStyle().setFontSize(newSize);
                 Logger.log("Scaled long name down from " + originalSize + " to " + newSize);
              }
            }
          } catch (e) {}
        } else if (element.getPageElementType() === SlidesApp.PageElementType.GROUP) {
          replaceAndScaleName(element.asGroup().getChildren(), tags, replacement);
        }
      }
    }
    
    var nameTags = ["<<PARTICIPANT FULLNAME>>", "<<Participant Fullname>>", "<<participant fullname>>", "{{NAME}}", "<<Fullname>>", "<<Full Name>>"];
    var slidesArray = presentation.getSlides();
    for (var s = 0; s < slidesArray.length; s++) {
      replaceAndScaleName(slidesArray[s].getPageElements(), nameTags, nameStr);
      // Also scale if they use the multi-line tag
      replaceAndScaleName(slidesArray[s].getPageElements(), ["<<MULTI_LINE_NAME>>"], multiLineName);
    }

    // Method 1: Global Replacement (for all other tags)
    var replacements = {
      "<<PARTICIPANT FULLNAME>>": nameStr,
      "<<Participant Fullname>>": nameStr,
      "<<participant fullname>>": nameStr,
      "<<FAMILY_NAME>>": String(familyName || ""),
      "<<GIVEN_NAME>>": String(givenName || ""),
      "<<MIDDLE_NAME>>": String(middleName || ""),
      "<<MULTI_LINE_NAME>>": multiLineName,
      "<<CHAPTER>>": chapStr,
      "<<Chapter>>": chapStr,
      "{{NAME}}": nameStr,
      "{{CHAPTER}}": chapStr,
      "{{EVENT_NAME}}": String(eventName || ""),
      "{{EVENT_DATE}}": String(eventDate || ""),
      "{{EVENT_LOCATION}}": String(eventLocation || ""),
      "{{ISSUE_DATE}}": String(issueDate || ""),
      "{{CERT_ID}}": String(certId || ""),
      "{{EMAIL}}": String(email || "")
    };

    for (var tag in replacements) {
      presentation.replaceAllText(tag, replacements[tag]);
    }

    // Method 2: Shape-by-Shape Replacement (handles Groups better)
    var slides = presentation.getSlides();
    slides.forEach(function(slide) {
      slide.getShapes().forEach(function(shape) {
        if (shape.getShapeType() === SlidesApp.ShapeType.TEXT_BOX || shape.getText()) {
          for (var tag in replacements) {
            try { shape.getText().replaceText(tag, replacements[tag]); } catch(e) {}
          }
        }
      });
    });

    // Replace other config keys if they exist as tags
    for (var key in config) {
      if (typeof config[key] !== 'object' && key.length < 50) {
        try { presentation.replaceAllText("{{" + key + "}}", String(config[key])); } catch (e) {}
      }
    }

    // QR code for Slides (ONLY if not a Certificate)
    if (docType !== "Certificate") {
      var folderUrl = participantFolder.getUrl();
      var qrData = (docType === "ID") ? (name + " | " + certId) : folderUrl;
      var qrApiUrl = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&format=png&data=" + encodeURIComponent(qrData);
      try {
        var qrResponse = UrlFetchApp.fetch(qrApiUrl);
        var qrBlob = qrResponse.getBlob().setName("qr-" + certId + ".png");
        var slides = presentation.getSlides();
        insertCertQrIntoSlides(slides, qrBlob);
      } catch (err) {
        Logger.log("QR fetch error: " + err);
      }
    } else {
      Logger.log("Skipping QR code for Certificate as requested.");
    }

    presentation.saveAndClose();
    
    // "Poke" the rendering engine by requesting a thumbnail first
    // and wait for a significant time to ensure the first cache hit is valid.
    try { DriveApp.getFileById(copyId).getThumbnail(); } catch(e) {}
    Utilities.sleep(8000); 
    
    // Robust PDF Export with retry logic
    var pdfBlob = null;
    for (var retries = 0; retries < 4; retries++) {
      try {
        pdfBlob = DriveApp.getFileById(copyId).getAs(MimeType.PDF);
        if (pdfBlob && pdfBlob.getBytes().length > 0) {
          break; // Success!
        }
      } catch (e) {
        Logger.log("PDF generation retry " + (retries + 1) + " failed: " + e);
      }
      Utilities.sleep(4000); // Increased wait between retries
    }
    if (!pdfBlob || pdfBlob.getBytes().length === 0) {
      throw new Error("Google Drive failed to render the PDF. Please try again.");
    }
    pdfBlob.setName(docName + ".pdf");

  } else {
    var doc = DocumentApp.openById(copyId);
    var body = doc.getBody();

    body.replaceText("<<Participant Fullname>>", name);
    body.replaceText("<<participant fullname>>", name);
    body.replaceText("<<Full Name>>", name);
    body.replaceText("<<Fullname>>", name);
    body.replaceText("<<Chapter>>", chapter);

    // Use a helper for curly brace placeholders to avoid regex issues
    var placeholders = {
      "{{NAME}}": name, "{{name}}": name, "{{Name}}": name, "{{FULL_NAME}}": name,
      "{{CHAPTER}}": chapter, "{{EVENT_NAME}}": eventName, "{{EVENT_DATE}}": eventDate,
      "{{EVENT_LOCATION}}": eventLocation, "{{ISSUE_DATE}}": issueDate,
      "{{CERT_ID}}": certId, "{{EMAIL}}": email
    };
    
    for (var p in placeholders) {
      try { body.replaceText(p.replace(/[\{\}]/g, "\\$&"), String(placeholders[p])); } catch(e) {}
    }

    for (var key in config) {
      if (typeof config[key] !== 'object') {
        try { body.replaceText("\\{\\{" + key + "\\}\\}", String(config[key])); } catch (e) {}
      }
    }

    // QR code for Docs (ONLY if not a Certificate)
    if (docType !== "Certificate") {
      var folderUrl = participantFolder.getUrl();
      var qrData = (docType === "ID") ? (name + " | " + certId) : folderUrl;
      var qrApiUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&format=png&data=" + encodeURIComponent(qrData);
      try {
        var qrResponse = UrlFetchApp.fetch(qrApiUrl);
        var qrBlob = qrResponse.getBlob().setName("qr-" + certId + ".png");
        insertCertQrIntoDoc(body, qrBlob);
      } catch (err) {
        Logger.log("QR fetch error: " + err);
      }
    }

    doc.saveAndClose();

    // "Poke" the rendering engine by requesting a thumbnail first
    try { DriveApp.getFileById(copyId).getThumbnail(); } catch(e) {}
    Utilities.sleep(8000);

    // Robust PDF Export with retry logic
    var pdfBlob = null;
    for (var retries = 0; retries < 4; retries++) {
      try {
        pdfBlob = DriveApp.getFileById(copyId).getAs(MimeType.PDF);
        if (pdfBlob && pdfBlob.getBytes().length > 0) {
          break;
        }
      } catch (e) {
        Logger.log("PDF generation retry " + (retries + 1) + " failed: " + e);
      }
      Utilities.sleep(4000);
    }
    if (!pdfBlob || pdfBlob.getBytes().length === 0) {
      throw new Error("Google Drive failed to render the PDF. Please try again.");
    }
    pdfBlob.setName(docName + ".pdf");
  }

  // Save PDF to folder
  var pdfFile = participantFolder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var pdfUrl = "https://drive.google.com/file/d/" + pdfFile.getId() + "/view?usp=sharing";
  Logger.log("✅ PDF Generated: " + pdfUrl + " (Size: " + pdfBlob.getBytes().length + " bytes)");

  // Trash the temporary copy so participants only see the PDF
  try { DriveApp.getFileById(copyId).setTrashed(true); } catch(e) {}

  return { pdfBlob: pdfBlob, pdfUrl: pdfUrl, folderUrl: mainFolder.getUrl() };
}


function insertCertQrIntoSlides(slides, qrBlob) {
  var found = false;

  function findAndReplaceQrShape(elements, slide) {
    for (var i = 0; i < elements.length; i++) {
      var element = elements[i];
      if (element.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        var shape = element.asShape();
        try {
          var text = shape.getText().asString().toUpperCase().replace(/[\n\r]+/g, "").replace(/\s+/g, "");
          if (text.indexOf("{{QR_CODE}}") !== -1 || 
              text.indexOf("<<QRCODE>>") !== -1 ||
              text.indexOf("<<QR_CODE>>") !== -1) {
            
            var left = shape.getLeft();
            var top = shape.getTop();
            var width = shape.getWidth();
            var height = shape.getHeight();
            
            slide.insertImage(qrBlob, left, top, width, height);
            try { shape.getText().setText(""); } catch(e){} // Clear text first
            try { shape.remove(); } catch(e){} // Then remove shape
            return true;
          }
        } catch (e) {
          // Shape doesn't have text
        }
      } else if (element.getPageElementType() === SlidesApp.PageElementType.GROUP) {
        var groupElements = element.asGroup().getChildren();
        if (findAndReplaceQrShape(groupElements, slide)) {
          return true;
        }
      }
    }
    return false;
  }

  for (var s = 0; s < slides.length; s++) {
    if (findAndReplaceQrShape(slides[s].getPageElements(), slides[s])) {
      Logger.log("QR code inserted into slide " + (s + 1));
      found = true;
      break;
    }
  }

  if (!found) {
    Logger.log("No {{QR_CODE}} placeholder found - inserting at default position");
    slides[0].insertImage(qrBlob, 10, 10, 100, 100);
  }
}


function insertCertQrIntoDoc(body, qrBlob) {
  var searchResult = body.findText("\\{\\{QR_CODE\\}\\}");
  if (!searchResult) {
    searchResult = body.findText("<<QR Code>>");
  }
  if (searchResult) {
    var element = searchResult.getElement();
    var paragraph = element.getParent();
    var parentBody = paragraph.getParent();
    var paragraphIndex = parentBody.getChildIndex(paragraph);
    var imgParagraph = parentBody.insertParagraph(paragraphIndex, "");
    imgParagraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    var inlineImage = imgParagraph.appendInlineImage(qrBlob);
    inlineImage.setWidth(150);
    inlineImage.setHeight(150);
    try {
      parentBody.removeChild(paragraph);
    } catch (err) {
      paragraph.clear();
    }
    Logger.log("QR inserted into document");
  } else {
    Logger.log("No {{QR_CODE}} placeholder found in Doc - skipping");
  }
}


function sendCertificateEmail(email, name, pdfBlob, pdfUrl, config) {
  var eventName = config.EVENT_NAME || "Event";
  var eventDate = config.EVENT_DATE || "";
  var eventLocation = config.EVENT_LOCATION || "";
  var orgName = config.ORG_NAME || "";
  var primaryColor = config.PRIMARY_COLOR || "#800000";
  var accentColor = config.ACCENT_COLOR || "#FFD700";

  var subject = "Your Certificate - " + eventName;
  var qrImageUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent(pdfUrl);

  var htmlBody = '<!DOCTYPE html><html><head>'
    + '<meta name="color-scheme" content="light dark">'
    + '<meta name="supported-color-schemes" content="light dark">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<style>'
    + ':root { color-scheme: light dark; supported-color-schemes: light dark; } '
    + '.darkmode-white { color: #fffffe !important; -webkit-text-fill-color: #fffffe !important; } '
    + '.darkmode-dark { color: #333333 !important; -webkit-text-fill-color: #333333 !important; } '
    + '.darkmode-gray { color: #555555 !important; -webkit-text-fill-color: #555555 !important; } '
    + '.darkmode-bg { background-color: #fcfcfc !important; } '
    + '@media only screen and (max-width: 600px) { '
    + '  .responsive-td { display: block !important; width: 100% !important; border-left: none !important; border-top: 1px solid #eeeeee !important; padding: 30px 20px !important; box-sizing: border-box !important; } '
    + '  .responsive-td-left { padding: 30px 20px !important; box-sizing: border-box !important; } '
    + '  .mobile-black { color: #000000 !important; -webkit-text-fill-color: #000000 !important; text-shadow: none !important; mix-blend-mode: normal !important; text-align: center !important; } '
    + '} '
    + '</style></head><body style="margin:0;padding:0;background-color:#f4f4f4;">'
    + '<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 30px 20px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #ddd; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">'
    + '<tr>'
    + '<td colspan="2" style="background: linear-gradient(135deg, ' + primaryColor + ', #333); padding: 25px 30px; text-align: center;">'
    + '<h2 class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 0.5px; text-align: center;">' + eventName + '</h2>'
    + (orgName ? '<p class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 8px 0 0 0; font-size: 14px; opacity: 0.95; text-align: center;">' + orgName + '</p>' : '')
    + '</td>'
    + '</tr>'
    + '<tr>'
    + '<td width="55%" class="responsive-td responsive-td-left" style="padding: 40px 30px; vertical-align: middle;">'
    + '<h3 class="darkmode-dark" style="color: #333333; margin-top: 0; font-size: 22px;">Congratulations!</h3>'
    + '<p class="darkmode-gray" style="color: #555555; font-size: 15px; line-height: 1.6;">Dear <strong>' + name + '</strong>,</p>'
    + '<p class="darkmode-gray" style="color: #555555; font-size: 15px; line-height: 1.6;">Thank you for participating in <strong>' + eventName + '</strong>. Your <strong>Certificate of Participation</strong> is attached to this email.</p>'
    + '<div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">'
    + '<p class="darkmode-gray" style="color: #555555; font-size: 13px; margin: 0;">Please download and keep the attached certificate for your records.</p>'
    + '</div>'
    + '</td>'
    + '<td width="45%" class="darkmode-bg responsive-td" style="padding: 40px 30px; text-align: center; vertical-align: middle; background-color: #fcfcfc; border-left: 1px solid #eeeeee;">'
    + '<div style="background: #ffffff; padding: 15px; display: inline-block; border-radius: 12px; border: 1px solid #ddd; box-shadow: 0 4px 10px rgba(0,0,0,0.03);">'
    + '<img src="' + qrImageUrl + '" width="150" height="150" style="margin: 0; display: block;" alt="Verification QR Code" />'
    + '</div>'
    + '<p class="darkmode-gray" style="color: #888888; font-size: 12px; margin-top: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">Verification QR</p>'
    + '</td>'
    + '</tr>'
    + '<tr>'
    + '<td colspan="2" style="background: linear-gradient(135deg, ' + primaryColor + ', ' + primaryColor + '); padding: 15px 30px; text-align: center;">'
    + '<p class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 0; font-size: 12px; opacity: 0.95; text-align: center;">' + eventName + '</p>'
    + '</td>'
    + '</tr>'
    + '</table>'
    + '</div></body></html>';

  GmailApp.sendEmail(email, subject, "", {
    htmlBody: htmlBody,
    attachments: [pdfBlob],
    name: eventName
  });
}


// ==========================================
//  DATA REPAIR - Fix EMAIL_STATUS column
// ==========================================
//
// Use this if some rows in the registration sheet have
// EMAIL_STATUS overwritten with "IN"/"OUT". It will:
// - Auto-detect the registration sheet from Settings (REG_SHEET_TAB)
// - Auto-detect EMAIL_SENT_TO / EMAIL_SENT_AT / EMAIL_STATUS columns
// - For any row where EMAIL_STATUS is "IN", "OUT", or empty but an email
//   was successfully sent, restore it to:
//      "VERIFIED SENT to {EMAIL_SENT_TO}"
//
// Run manually from the Apps Script editor:  repairEmailStatus();

function repairEmailStatus() {
  var config = getSettings();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetTab = config.REG_SHEET_TAB || "Form Responses 1";
  var sheet = ss.getSheetByName(sheetTab);

  if (!sheet) {
    Logger.log("repairEmailStatus: Sheet '" + sheetTab + "' not found.");
    return;
  }

  var cols = getColumnMap(sheet);
  var emailSentToCol = findColumn(cols, ["EMAIL_SENT_TO", "Email Sent To"]);
  var emailSentAtCol = findColumn(cols, ["EMAIL_SENT_AT", "Email Sent At"]);
  var emailStatusCol = findColumn(cols, ["EMAIL_STATUS", "Email Status"]);

  if (emailStatusCol === -1) {
    Logger.log("repairEmailStatus: EMAIL_STATUS column not found. Nothing to fix.");
    return;
  }
  if (emailSentToCol === -1 && emailSentAtCol === -1) {
    Logger.log("repairEmailStatus: EMAIL_SENT_TO / EMAIL_SENT_AT columns not found. Cannot safely reconstruct status.");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("repairEmailStatus: No data rows to process.");
    return;
  }

  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var emailStatusIndex = emailStatusCol - 1;
  var emailSentToIndex = emailSentToCol > 0 ? emailSentToCol - 1 : -1;
  var emailSentAtIndex = emailSentAtCol > 0 ? emailSentAtCol - 1 : -1;

  var updates = [];
  var fixedCount = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var curStatus = String(row[emailStatusIndex] || "").trim();
    var emailTo = emailSentToIndex >= 0 ? String(row[emailSentToIndex] || "").trim() : "";
    var emailAt = emailSentAtIndex >= 0 ? row[emailSentAtIndex] : "";

    var looksOverwritten = (curStatus === "IN" || curStatus === "OUT");
    var looksMissing = (!curStatus && (emailTo || emailAt));

    var newStatus = curStatus;
    if ((looksOverwritten || looksMissing) && emailTo) {
      newStatus = "VERIFIED SENT to " + emailTo;
    }

    if (newStatus !== curStatus) {
      fixedCount++;
    }

    updates.push([newStatus]);
  }

  sheet.getRange(2, emailStatusCol, updates.length, 1).setValues(updates);
  Logger.log("repairEmailStatus: updated " + fixedCount + " rows in '" + sheetTab + "'.");
}


// Fix duplicate STATUS/SCAN_TIME columns that were accidentally created.
// - Consolidates ATTENDED/IN and scan timestamps into the left-most STATUS + SCAN_TIME columns
// - Consolidates OUT into the left-most STATUS_OUT + SCAN_TIME_OUT columns
// - Renames extra duplicate headers so the sheet no longer shows:
//   STATUS SCAN_TIME STATUS SCAN_TIME STATUS SCAN_TIME ...
//
// Run manually: fixDuplicateAttendanceColumns();
function fixDuplicateAttendanceColumns() {
  var config = getSettings();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetTab = config.REG_SHEET_TAB || "Form Responses 1";
  var sheet = ss.getSheetByName(sheetTab);
  if (!sheet) {
    Logger.log("fixDuplicateAttendanceColumns: Sheet '" + sheetTab + "' not found.");
    return;
  }

  var statusCols = findAllColumnsByHeaderNames(sheet, ["STATUS", "Status", "Attendance Status"]);
  var scanTimeCols = findAllColumnsByHeaderNames(sheet, ["SCAN_TIME", "Scan Time", "Check-in Time", "Check in Time"]);
  var statusOutCols = findAllColumnsByHeaderNames(sheet, ["STATUS_OUT", "Status Out"]);
  var scanTimeOutCols = findAllColumnsByHeaderNames(sheet, ["SCAN_TIME_OUT", "Scan Time Out"]);

  var primaryStatusCol = statusCols.length ? statusCols[0] : -1;
  var primaryScanTimeCol = scanTimeCols.length ? scanTimeCols[0] : -1;
  var primaryStatusOutCol = statusOutCols.length ? statusOutCols[0] : -1;
  var primaryScanTimeOutCol = scanTimeOutCols.length ? scanTimeOutCols[0] : -1;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    Logger.log("fixDuplicateAttendanceColumns: No data rows to process.");
    return;
  }

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  // Consolidate values row-by-row
  var statusUpdates = [];
  var scanTimeUpdates = [];
  var statusOutUpdates = [];
  var scanTimeOutUpdates = [];

  for (var r = 0; r < data.length; r++) {
    var row = data[r];

    var consolidatedStatus = preferredStatusFromCols(row, statusCols);
    if (String(consolidatedStatus).toUpperCase() === "IN") consolidatedStatus = "ATTENDED";

    var consolidatedScanTime = preferredDateValueFromCols(row, scanTimeCols);
    var consolidatedStatusOut = firstNonEmptyFromCols(row, statusOutCols);
    var consolidatedScanTimeOut = preferredDateValueFromCols(row, scanTimeOutCols);

    statusUpdates.push([consolidatedStatus]);
    scanTimeUpdates.push([consolidatedScanTime]);
    statusOutUpdates.push([consolidatedStatusOut]);
    scanTimeOutUpdates.push([consolidatedScanTimeOut]);
  }

  if (primaryStatusCol > 0) sheet.getRange(2, primaryStatusCol, statusUpdates.length, 1).setValues(statusUpdates);
  if (primaryScanTimeCol > 0) sheet.getRange(2, primaryScanTimeCol, scanTimeUpdates.length, 1).setValues(scanTimeUpdates);
  if (primaryStatusOutCol > 0) sheet.getRange(2, primaryStatusOutCol, statusOutUpdates.length, 1).setValues(statusOutUpdates);
  if (primaryScanTimeOutCol > 0) sheet.getRange(2, primaryScanTimeOutCol, scanTimeOutUpdates.length, 1).setValues(scanTimeOutUpdates);

  // Rename duplicates (keep primary headers intact)
  for (var i = 1; i < statusCols.length; i++) {
    sheet.getRange(1, statusCols[i]).setValue("STATUS_DUPLICATE_" + (i + 1));
  }
  for (var i = 1; i < scanTimeCols.length; i++) {
    sheet.getRange(1, scanTimeCols[i]).setValue("SCAN_TIME_DUPLICATE_" + (i + 1));
  }
  for (var i = 1; i < statusOutCols.length; i++) {
    sheet.getRange(1, statusOutCols[i]).setValue("STATUS_OUT_DUPLICATE_" + (i + 1));
  }
  for (var i = 1; i < scanTimeOutCols.length; i++) {
    sheet.getRange(1, scanTimeOutCols[i]).setValue("SCAN_TIME_OUT_DUPLICATE_" + (i + 1));
  }

  SpreadsheetApp.flush();
  Logger.log(
    "fixDuplicateAttendanceColumns: consolidated and renamed duplicates in '" +
      sheetTab +
      "'. STATUS cols=" +
      statusCols.length +
      ", SCAN_TIME cols=" +
      scanTimeCols.length
  );
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
    ["ACCENT_COLOR", "#FFD700"],
    ["EVAL_SHEET_ID", "PASTE_YOUR_EVALUATION_SPREADSHEET_ID_HERE"],
    ["CERT_TEMPLATE_ID", ""],
    ["ID_TEMPLATE_ID", ""],
    ["FOLDER_ID", ""]
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


// ==========================================
//  STRESS TEST - 1000 Registration Emails
// ==========================================
// Run stressTestStart() to begin
// Run stressTestStatus() to check progress
// Run stressTestStop() to cancel

var BATCH_SIZE = 45;  // emails per batch (fits in 6-min limit)
var BATCH_DELAY = 1;  // minutes between batches (must be 1, 5, 10, 15, or 30)

function stressTestStart() {
  var config = getSettings();
  var testEmail = Session.getActiveUser().getEmail();
  var totalEmails = 1000;

  // Check daily quota remaining
  var remaining = MailApp.getRemainingDailyQuota();
  Logger.log("=== STRESS TEST SETUP ===");
  Logger.log("Test email: " + testEmail);
  Logger.log("Target: " + totalEmails + " emails");
  Logger.log("Daily quota remaining: " + remaining);
  Logger.log("Batch size: " + BATCH_SIZE);
  Logger.log("Event: " + (config.EVENT_NAME || "Event"));

  if (remaining < 10) {
    Logger.log("ERROR: Daily email quota too low (" + remaining + "). Try again tomorrow.");
    return;
  }

  // Cap at remaining quota
  if (totalEmails > remaining) {
    totalEmails = remaining;
    Logger.log("WARNING: Capped at " + totalEmails + " (daily quota limit)");
  }

  // Create or reset tracking sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trackSheet = ss.getSheetByName("StressTest");
  if (trackSheet) ss.deleteSheet(trackSheet);
  trackSheet = ss.insertSheet("StressTest");
  trackSheet.getRange("A1:F1").setValues([["#", "Name", "CertID", "Status", "Time", "Duration (ms)"]]);
  trackSheet.getRange("A1:F1").setFontWeight("bold");

  // Store test state in Properties
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    "STRESS_TOTAL": String(totalEmails),
    "STRESS_SENT": "0",
    "STRESS_FAILED": "0",
    "STRESS_EMAIL": testEmail,
    "STRESS_START": new Date().toISOString(),
    "STRESS_RUNNING": "true"
  });

  Logger.log("Starting first batch...");
  stressTestBatch();

  // Schedule next batches
  if (totalEmails > BATCH_SIZE) {
    ScriptApp.newTrigger("stressTestBatch")
      .timeBased()
      .everyMinutes(BATCH_DELAY)
      .create();
    Logger.log("Auto-batch trigger created (every " + BATCH_DELAY + " min)");
  }

  Logger.log("=== TEST STARTED ===");
}

function stressTestBatch() {
  var props = PropertiesService.getScriptProperties();

  if (props.getProperty("STRESS_RUNNING") !== "true") {
    Logger.log("Stress test not running. Use stressTestStart().");
    return;
  }

  var total = parseInt(props.getProperty("STRESS_TOTAL") || "0");
  var sent = parseInt(props.getProperty("STRESS_SENT") || "0");
  var failed = parseInt(props.getProperty("STRESS_FAILED") || "0");
  var testEmail = props.getProperty("STRESS_EMAIL");

  if (sent + failed >= total) {
    Logger.log("Test complete! Sent: " + sent + ", Failed: " + failed);
    stressTestStop();
    return;
  }

  var config = getSettings();
  var eventName = config.EVENT_NAME || "Event";
  var orgName = config.ORG_NAME || "";
  var primaryColor = config.PRIMARY_COLOR || "#800000";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trackSheet = ss.getSheetByName("StressTest");

  var batchStart = sent + failed;
  var batchEnd = Math.min(batchStart + BATCH_SIZE, total);
  var batchSent = 0;
  var batchFailed = 0;

  Logger.log("=== BATCH: " + (batchStart + 1) + " to " + batchEnd + " of " + total + " ===");

  for (var i = batchStart; i < batchEnd; i++) {
    var num = i + 1;
    var testName = "Test User " + num;
    var certId = "TEST-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    var startTime = new Date().getTime();

    try {
      // Generate QR code
      var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(testName + " | " + certId);

      // Build email HTML (same as real registration email)
      var htmlBody = '<!DOCTYPE html><html><head>'
        + '<meta name="color-scheme" content="light dark">'
        + '<meta name="supported-color-schemes" content="light dark">'
        + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        + '<style>'
        + ':root { color-scheme: light dark; supported-color-schemes: light dark; } '
        + '.darkmode-white { color: #fffffe !important; -webkit-text-fill-color: #fffffe !important; } '
        + '.darkmode-dark { color: #333333 !important; -webkit-text-fill-color: #333333 !important; } '
        + '.darkmode-gray { color: #555555 !important; -webkit-text-fill-color: #555555 !important; } '
        + '.darkmode-bg { background-color: #fcfcfc !important; } '
        + '@media only screen and (max-width: 600px) { '
        + '  .responsive-td { display: block !important; width: 100% !important; border-left: none !important; border-top: 1px solid #eeeeee !important; padding: 30px 20px !important; box-sizing: border-box !important; } '
        + '  .responsive-td-left { padding: 30px 20px !important; box-sizing: border-box !important; } '
        + '  .mobile-black { color: #000000 !important; -webkit-text-fill-color: #000000 !important; text-shadow: none !important; mix-blend-mode: normal !important; text-align: center !important; } '
        + '} '
        + '</style></head><body style="margin:0;padding:0;background-color:#f4f4f4;">'
        + '<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 30px 20px;">'
        + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #ddd; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">'
        + '<tr>'
        + '<td colspan="2" style="background: linear-gradient(135deg, ' + primaryColor + ', #333); padding: 25px 30px; text-align: center;">'
        + '<h2 class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 0.5px; text-align: center;">' + eventName + '</h2>'
        + (orgName ? '<p class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 8px 0 0 0; font-size: 14px; opacity: 0.95; text-align: center;">' + orgName + '</p>' : '')
        + '</td>'
        + '</tr>'
        + '<tr>'
        + '<td width="55%" class="responsive-td responsive-td-left" style="padding: 40px 30px; vertical-align: middle;">'
        + '<h3 class="darkmode-dark" style="color: #333333; margin-top: 0; font-size: 22px;">Registration Confirmed!</h3>'
        + '<p class="darkmode-gray" style="color: #555555; font-size: 15px; line-height: 1.6;">Hello <strong>' + testName + '</strong>,</p>'
        + '<p class="darkmode-gray" style="color: #555555; font-size: 15px; line-height: 1.6;">You are successfully registered. Please present the QR code at the entrance of the event for quick check-in.</p>'
        + '<div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">'
        + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout: fixed; margin: 0 auto;">'
        + '<tr>'
        + '<td width="50%" align="center" style="padding-bottom: 4px; text-align: center;"><strong class="darkmode-dark" style="color:#333; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">Attendee</strong></td>'
        + '<td width="50%" align="center" style="padding-bottom: 4px; text-align: center;"><strong class="darkmode-dark" style="color:#333; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">Certificate ID</strong></td>'
        + '</tr>'
        + '<tr>'
        + '<td align="center" style="padding-top: 4px; text-align: center; vertical-align: top;"><span class="darkmode-gray" style="color:#555; font-size:15px; word-break: break-word;">' + testName + '</span></td>'
        + '<td align="center" style="padding-top: 4px; text-align: center; vertical-align: top;"><span class="darkmode-gray" style="color:#555; font-size:15px; word-break: break-all;">' + certId + '</span></td>'
        + '</tr>'
        + '</table>'
        + '</div>'
        + '</td>'
        + '<td width="45%" class="darkmode-bg responsive-td" style="padding: 40px 30px; text-align: center; vertical-align: middle; background-color: #fcfcfc; border-left: 1px solid #eeeeee;">'
        + '<div style="background: #ffffff; padding: 15px; display: inline-block; border-radius: 12px; border: 1px solid #ddd; box-shadow: 0 4px 10px rgba(0,0,0,0.03);">'
        + '<img src="' + qrUrl + '" width="180" height="180" style="margin: 0; display: block;" alt="QR Code" />'
        + '</div>'
        + '<p class="darkmode-gray" style="color: #888888; font-size: 12px; margin-top: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">Ready to Scan</p>'
        + '</td>'
        + '</tr>'
        + '<tr>'
        + '<td colspan="2" style="background: linear-gradient(135deg, ' + primaryColor + ', ' + primaryColor + '); padding: 15px 30px; text-align: center;">'
        + '<p class="darkmode-white mobile-black" style="color: #ffffff; -webkit-text-fill-color: #ffffff; margin: 0; font-size: 12px; opacity: 0.95; text-align: center;">[STRESS TEST ' + num + '/' + total + '] ' + eventName + '</p>'
        + '</td>'
        + '</tr>'
        + '</table>'
        + '</div></body></html>';

      GmailApp.sendEmail(testEmail, "[TEST " + num + "/" + total + "] QR Code - " + eventName, "", {
        htmlBody: htmlBody,
        name: eventName + " (Stress Test)"
      });

      var duration = new Date().getTime() - startTime;
      trackSheet.appendRow([num, testName, certId, "SENT", new Date().toLocaleString(), duration]);
      batchSent++;
      sent++;
      Logger.log("✓ " + num + "/" + total + " sent (" + duration + "ms)");

    } catch (err) {
      var duration = new Date().getTime() - startTime;
      trackSheet.appendRow([num, testName, certId, "FAILED: " + err, new Date().toLocaleString(), duration]);
      batchFailed++;
      failed++;
      Logger.log("✗ " + num + "/" + total + " FAILED: " + err);

      // If quota exceeded, stop
      if (String(err).indexOf("quota") !== -1 || String(err).indexOf("limit") !== -1) {
        Logger.log("QUOTA HIT - stopping test");
        props.setProperty("STRESS_SENT", String(sent));
        props.setProperty("STRESS_FAILED", String(failed));
        stressTestStop();
        return;
      }
    }
  }

  // Update progress
  props.setProperty("STRESS_SENT", String(sent));
  props.setProperty("STRESS_FAILED", String(failed));

  var remaining = total - sent - failed;
  Logger.log("Batch done. Sent: " + batchSent + ", Failed: " + batchFailed);
  Logger.log("Total progress: " + (sent + failed) + "/" + total + " (" + remaining + " remaining)");
  Logger.log("Quota remaining: " + MailApp.getRemainingDailyQuota());

  if (remaining <= 0) {
    Logger.log("=== STRESS TEST COMPLETE ===");
    stressTestStop();
  }
}

function stressTestStatus() {
  var props = PropertiesService.getScriptProperties();
  var running = props.getProperty("STRESS_RUNNING") === "true";
  var total = props.getProperty("STRESS_TOTAL") || "0";
  var sent = props.getProperty("STRESS_SENT") || "0";
  var failed = props.getProperty("STRESS_FAILED") || "0";
  var startTime = props.getProperty("STRESS_START") || "";
  var email = props.getProperty("STRESS_EMAIL") || "";

  Logger.log("=== STRESS TEST STATUS ===");
  Logger.log("Running: " + running);
  Logger.log("Target: " + total);
  Logger.log("Sent: " + sent);
  Logger.log("Failed: " + failed);
  Logger.log("Remaining: " + (parseInt(total) - parseInt(sent) - parseInt(failed)));
  Logger.log("Test email: " + email);
  Logger.log("Started: " + startTime);
  Logger.log("Email quota remaining: " + MailApp.getRemainingDailyQuota());
}

function stressTestStop() {
  // Remove batch triggers
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "stressTestBatch") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty("STRESS_RUNNING", "false");

  var sent = props.getProperty("STRESS_SENT") || "0";
  var failed = props.getProperty("STRESS_FAILED") || "0";
  var total = props.getProperty("STRESS_TOTAL") || "0";

  Logger.log("=== STRESS TEST STOPPED ===");
  Logger.log("Final: " + sent + " sent, " + failed + " failed out of " + total);
  Logger.log("Results saved in 'StressTest' sheet tab");
}

// ==========================================
//  6. BULK PROCESSING & UTILITIES
// ==========================================

/**
 * Creates a custom menu in Google Sheets.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 PAMET Master Console')
    .addItem('📧 Send Confirmation Email (Selected Row)', 'sendEmailToSelectedRow')
    .addItem('🆔 Send QR & ID Email (Selected Row)', 'sendQrEmailToSelectedRow')
    .addSeparator()
    .addItem('🔍 Process Missing IDs (Highlighted Only)', 'processMissingCertIds')
    .addSeparator()
    .addItem('⚙️ Setup Form Trigger', 'setupTrigger')
    .addItem('🧪 Run System Test', 'testSetup')
    .addItem('📋 List All Sheets', 'listSheets')
    .addToUi();
}

/**
 * Bulk processes rows that are highlighted but missing a CERT_ID.
 * This is used after importing "EXISTING PAMET DATA".
 */
function processMissingCertIds() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('Process Highlighted Rows?', 
    'This will generate Certificate IDs for all HIGHLIGHTED rows (non-white background) that do not have one yet. \n\nContinue?', 
    ui.ButtonSet.YES_NO);
  
  if (response !== ui.Button.YES) return;

  var config;
  try {
    config = getSettings();
  } catch (e) {
    ui.alert("Error: " + e.message);
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet(); // Use the sheet the user is currently viewing
  
  var cols = getColumnMap(sheet);
  var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID", "CertID"]);
  var statusCol = findColumn(cols, ["STATUS", "Status", "Attendance Status"]);

  // Ensure columns exist
  if (certIdCol === -1) {
    certIdCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, certIdCol).setValue("CERT_ID");
  }
  if (statusCol === -1) {
    statusCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, statusCol).setValue("STATUS");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert("No data found in the active sheet.");
    return;
  }

  // Get all data and backgrounds at once for performance
  var values = sheet.getDataRange().getValues();
  var backgrounds = sheet.getDataRange().getBackgrounds();
  var processedCount = 0;

  Logger.log("Processing active sheet: " + sheet.getName());
  Logger.log("Headers found: " + JSON.stringify(Object.keys(cols)));

  for (var i = 1; i < values.length; i++) {
    var row = i + 1;
    var name = extractFullName(values[i], cols);
    var currentCertId = String(values[i][certIdCol - 1] || "").trim();
    
    // Check the first 10 columns for a GREEN highlight
    var isHighlighted = false;
    var rowBgs = backgrounds[i];
    var detectedColor = "";

    for (var colIdx = 0; colIdx < Math.min(rowBgs.length, 10); colIdx++) {
      var cellBg = rowBgs[colIdx].toLowerCase();
      
      // Skip white/transparent
      if (cellBg === "#ffffff" || cellBg === "white" || cellBg === "transparent" || cellBg === "rgba(0,0,0,0)") continue;

      // Check if it's "Greenish"
      if (cellBg.indexOf('#') === 0 && cellBg.length === 7) {
        var r = parseInt(cellBg.slice(1, 3), 16);
        var g = parseInt(cellBg.slice(3, 5), 16);
        var b = parseInt(cellBg.slice(5, 7), 16);
        
        if (g > r && g > b) {
          isHighlighted = true;
          detectedColor = cellBg;
          break;
        }
      } else if (cellBg.includes("green")) {
        isHighlighted = true;
        detectedColor = cellBg;
        break;
      }
    }

    if (isHighlighted && !currentCertId) {
      if (!name) {
         Logger.log("Row " + row + ": Highlighted (" + detectedColor + ") but NAME not found. Skipping.");
         continue;
      }
      
      // Generate a new unique ID
      var certId = "CERT-" + Utilities.getUuid().slice(0, 8).toUpperCase();
      sheet.getRange(row, certIdCol).setValue(certId);
      sheet.getRange(row, statusCol).setValue("IMPORTED");
      processedCount++;
    }
  }

  SpreadsheetApp.flush();
  ui.alert("Bulk Processing Complete", 
    "Successfully processed " + processedCount + " highlighted rows in '" + sheet.getName() + "'.\n\n" +
    "Check View > Logs if you expected more rows.", 
    ui.ButtonSet.OK);
}

function debugVinzent() {
  const email = "vkestrada20467@liceo.edu.ph";
  const name = "VINZENT ESTRADA";
  const result = doPost({
    postData: {
      contents: JSON.stringify({ action: "sendCertificate", email: email, name: name })
    }
  });
  Logger.log("Result: " + result.getContent());
}

// ==========================================
//  BULK PROCESSING
// ==========================================

/**
 * Automatically assigns IDs and STATUS="IMPORTED" to any rows with a name but no ID.
 * Run this from the Apps Script editor to sync your data.
 */
function processMissingIDs() {
  try {
    var config = getSettings();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTab = config.REG_SHEET_TAB || "Form Responses 1";
    var sheet = ss.getSheetByName(sheetTab);

    if (!sheet) return "Error: Sheet not found";

    var cols = getColumnMap(sheet);
    var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name", "Complete Name"]);
    var certIdCol = findColumn(cols, ["CERT_ID", "Certificate ID"]);
    var statusCol = findColumn(cols, ["STATUS", "Status"]);

    if (certIdCol === -1) {
      certIdCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, certIdCol).setValue("CERT_ID");
    }
    if (statusCol === -1) {
      statusCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, statusCol).setValue("STATUS");
    }

    var values = sheet.getDataRange().getValues();
    var count = 0;

    for (var i = 1; i < values.length; i++) {
      var name = nameCol > 0 ? String(values[i][nameCol - 1] || "").trim() : "";
      var certId = certIdCol > 0 ? String(values[i][certIdCol - 1] || "").trim() : "";
      var status = statusCol > 0 ? String(values[i][statusCol - 1] || "").trim() : "";

      if (name && !certId) {
        var newId = "CERT-" + Utilities.getUuid().slice(0, 8).toUpperCase();
        sheet.getRange(i + 1, certIdCol).setValue(newId);
        if (!status || status === "") {
          sheet.getRange(i + 1, statusCol).setValue("IMPORTED");
        }
        count++;
      }
    }

    SpreadsheetApp.flush();
    return "Successfully processed " + count + " missing IDs.";
  } catch (e) {
    return "Error: " + e.toString();
  }
}


// ==========================================
//  MANUAL EMAIL TOOLS
// ==========================================

/**
 * Sends a basic "Registration Confirmed" validation email to the selected row.
 * Uses the template provided in emailmanual.gs but with robust column detection.
 */
function sendEmailToSelectedRow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var row = sheet.getActiveRange().getRow();

  if (row === 1) {
    SpreadsheetApp.getUi().alert("⚠️ Please select a registrant row (not the header).");
    return;
  }

  var config;
  try {
    config = getSettings();
  } catch (e) {
    SpreadsheetApp.getUi().alert("❌ Error: " + e.message);
    return;
  }

  var cols = getColumnMap(sheet);
  var rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

  var fullName = extractFullName(rowValues, cols);
  var emailCol = findColumn(cols, ["Email Address", "Email", "email address", "email"]);

  if (!fullName || emailCol === -1) {
    SpreadsheetApp.getUi().alert("❌ Required columns (Name/Email) not found. Check your headers.");
    return;
  }

  var email = String(sheet.getRange(row, emailCol).getValue() || "").trim();

  if (!email) {
    SpreadsheetApp.getUi().alert("❌ No email found in this row.");
    return;
  }

  // Get Branding Settings
  var eventName = config.EVENT_NAME || "MAIN CONFERENCE";
  var orgName = config.ORG_NAME || "";
  var eventDate = config.EVENT_DATE || "";
  var eventLocation = config.EVENT_LOCATION || "";
  var primaryColor = config.PRIMARY_COLOR || "#217d05";

  var htmlBody =
    '<div style="font-family: Arial, sans-serif; max-width:500px; margin:auto; border:1px solid #eee; border-radius:8px; overflow:hidden;">' +
      '<div style="background:' + primaryColor + '; padding:40px; text-align:center; color:white;">' +
        '<h2 style="margin:0;">' + eventName + '</h2>' +
        (orgName ? '<p style="margin:10px 0 0 0; opacity:0.9;">' + orgName + '</p>' : '') +
      '</div>' +
      '<div style="padding:25px; color:#444; line-height:1.6;">' +
        '<h3 style="color:' + primaryColor + '; margin-top:0;">Registration Confirmed</h3>' +
        '<p>Hello <strong>' + fullName + '</strong>,</p>' +
        '<p>Your <strong>registration</strong> has been successfully validated.</p>' +

        '<p><strong>Event Date:</strong> ' + eventDate + '</p>' +
        '<p><strong>Location:</strong> ' + eventLocation + '</p>' +

        '<hr style="border:0; border-top:1px solid #eee; margin:20px 0;">' +
        '<p style="text-align:center; font-size:14px; color:#888;">We look forward to seeing you!</p>' +
      '</div>' +
    '</div>';

  try {
    GmailApp.sendEmail(
      email,
      "Registration Confirmation - " + eventName,
      "",
      {
        htmlBody: htmlBody,
        name: eventName
      }
    );

    // Update tracking if column exists
    var emailStatusCol = findColumn(cols, ["EMAIL_STATUS", "Email Status"]);
    if (emailStatusCol !== -1) {
      sheet.getRange(row, emailStatusCol).setValue("VALIDATED & SENT by Admin");
    }

    SpreadsheetApp.getUi().alert("✅ Registration Confirmation sent to " + fullName);

  } catch (err) {
    SpreadsheetApp.getUi().alert("❌ Failed to send email: " + err);
  }
}

/**
 * Sends the standard QR Code & ID email to the selected row.
 */
function sendQrEmailToSelectedRow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var row = sheet.getActiveRange().getRow();

  if (row === 1) {
    SpreadsheetApp.getUi().alert("⚠️ Please select a registrant row (not the header).");
    return;
  }

  var config;
  try {
    config = getSettings();
  } catch (e) {
    SpreadsheetApp.getUi().alert("❌ Error: " + e.message);
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var response = ui.alert("Send QR & ID?", "This will generate (if missing) and send the QR Code and ID to the selected row. Continue?", ui.ButtonSet.YES_NO);
  
  if (response !== ui.Button.YES) return;

  var success = processAndSendRegistrationEmail(sheet, row, config);
  
  if (success) {
    ui.alert("✅ QR & ID Email sent successfully!");
  } else {
    ui.alert("❌ Failed to send email. Check View > Logs for details.");
  }
}

/**
 * Checks if an email exists in the Evaluation Spreadsheet.
 * Looks for any tab containing "Form Response" or "Evaluation".
 */
function checkEvaluationStatus(email, evalSheetId) {
  try {
    var evalSS = SpreadsheetApp.openById(evalSheetId);
    var sheets = evalSS.getSheets();
    var emailLower = email.toLowerCase().trim();

    for (var i = 0; i < sheets.length; i++) {
      var sName = sheets[i].getName().toLowerCase();
      // Only check response sheets to save time
      if (sName.indexOf("form response") !== -1 || sName.indexOf("eval") !== -1 || sName.indexOf("response") !== -1) {
        var data = sheets[i].getDataRange().getValues();
        if (data.length < 2) continue;

        // Find email column in this sheet
        var headers = data[0];
        var emailColIdx = -1;
        for (var h = 0; h < headers.length; h++) {
          var header = String(headers[h]).toLowerCase();
          if (header.indexOf("email") !== -1) {
            emailColIdx = h;
            break;
          }
        }

        if (emailColIdx !== -1) {
          for (var r = 1; r < data.length; r++) {
            if (String(data[r][emailColIdx] || "").toLowerCase().trim() === emailLower) {
              Logger.log("Evaluation confirmed for: " + email);
              return true;
            }
          }
        }
      }
    }
    Logger.log("Evaluation NOT FOUND for: " + email);
    return false;
  } catch (err) {
    Logger.log("Error checking evaluation status: " + err);
    // If we can't open the eval sheet, we assume it might be because of permissions
    // but we don't want to block the whole system. However, for a strict rule,
    // you might want to return false here.
    return false; 
  }
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  
  // Existing PAMET menu
  ui.createMenu('🚀 PAMET Master Console')
    .addItem('📧 Send Confirmation Email (Selected Row)', 'sendEmailToSelectedRow')
    .addItem('🆔 Send QR & ID Email (Selected Row)', 'sendQrEmailToSelectedRow')
    .addItem('🔍 Process Missing IDs (Highlighted Only)', 'processMissingCertIds')
    .addSeparator()
    .addItem('⚙️ Setup Form Trigger', 'setupTrigger')
    .addItem('🧪 Run System Test', 'testSetup')
    .addItem('📋 List All Sheets', 'listSheets')
    .addSeparator()
    .addItem('📨 Check Remaining Email Quota', 'checkRemainingEmailQuota')
    .addToUi();

  // Pre-Con menu
  ui.createMenu('📧 Pre-Con Emails')
    .addItem('🎟️ Send PRE-CON 1 Email (Selected Row)', 'sendPreCon1Email')
    .addItem('🎟️ Send PRE-CON 2 Email (Selected Row)', 'sendPreCon2Email')
    .addSeparator()
    .addItem('📨 Check Remaining Email Quota', 'checkRemainingEmailQuota')
    .addSeparator()
    .addItem('ℹ️ Test Pre-Con Setup', 'testPreConSetup')
    .addToUi();
}

/*************************************************
 * CHECK REMAINING EMAIL QUOTA
 *************************************************/

function checkRemainingEmailQuota() {
  
  var remainingQuota = MailApp.getRemainingDailyQuota();
  
  var quotaMessage =
    "📨 Remaining Daily Email Quota\n\n" +
    "You can still send:\n\n" +
    remainingQuota + " email(s) today.\n\n" +
    "⚠️ Google quota resets every 24 hours.";

  SpreadsheetApp.getUi().alert(
    "Email Quota Status",
    quotaMessage,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  Logger.log("Remaining Email Quota: " + remainingQuota);
}

/*************************************************
 * PRE-CON CONFIGURATION (Dynamic Column Detection)
 * Uses same robust detection as main system
 *************************************************/

function getPreConColumns(sheet) {
  var cols = getColumnMap(sheet); // Reuse existing function!
  
  // Dynamic detection - works with ANY sheet layout
  var emailCol = findColumn(cols, ["Email Address", "Email", "email address", "email"]);
  var nameCol = findColumn(cols, ["Full Name", "Fullname", "Name", "Complete Name", "Participant"]);
  var statusCol = findColumn(cols, ["Status", "EMAIL STATUS", "Pre-Con Status"]);
  var sentAtCol = findColumn(cols, ["Sent At", "Email Sent At", "Date Sent"]);
  
  return {
    email: emailCol,
    name: nameCol,
    status: statusCol || sheet.getLastColumn() + 1,
    sentAt: sentAtCol || sheet.getLastColumn() + 2
  };
}

/*************************************************
 * PRE-CON 1 EMAIL (Kave 1)
 *************************************************/

function sendPreCon1Email() {
  sendPreConEmail("PRE-CON 1", "Kave 1, Luxe Hotel Lobby");
}

/*************************************************
 * PRE-CON 2 EMAIL (Kave 2) 
 *************************************************/

function sendPreCon2Email() {
  sendPreConEmail("PRE-CON 2", "Kave 2, Luxe Hotel Lobby");
}

/*************************************************
 * UNIVERSAL PRE-CON EMAIL FUNCTION
 * Fully compatible with PAMET system
 *************************************************/

function sendPreConEmail(preConNumber, location) {
  var config = getSettings(); // Reuse existing settings!
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var row = sheet.getActiveRange().getRow();

  // Safety check
  if (row === 1) {
    SpreadsheetApp.getUi().alert("⚠️ Please select a valid data row (not header).");
    return;
  }

  // Dynamic column detection (works with ANY sheet)
  var cols = getPreConColumns(sheet);
  var rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var email = cols.email > 0 ? String(rowValues[cols.email - 1] || "").trim() : "";
  var name = cols.name > 0 ? extractFullName(rowValues, getColumnMap(sheet)) : "";
  
  if (!email) {
    SpreadsheetApp.getUi().alert("❌ No Email column found. Check your headers.");
    return;
  }
  
  if (!name) name = "Participant";

  // Event details from Settings (or defaults)
  var eventName = config.EVENT_NAME || "30th PAMET National Midyear Convention";
  var eventDate = config.EVENT_DATE || "May 13, 2026";
  
  var subject = ` FREE SLOT - ${preConNumber} | ${eventName}`;

  var htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #217d05, #28a745); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
    .highlight { background: #fff3cd; padding: 15px; border-left: 5px solid #ffc107; margin: 20px 0; border-radius: 5px; }
    .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
    @media (max-width: 600px) { .header, .content { padding: 20px 15px; } }
  </style>
</head>
<body>
  <div class="header">
    <h2 style="margin: 0; font-size: 24px;"> FREE PRE-CON SLOT</h2>
    <p style="margin: 5px 0 0 0; opacity: 0.9;">${eventName}</p>
  </div>
  
  <div class="content">
    <h3 style="color: #217d05; margin-top: 0;">Dear ${name},</h3>
    
    <p>We are <strong>thrilled to announce</strong> that you have earned a <strong>FREE SLOT</strong> for the PRE-CONVENTION session!</p>
    
    <div class="highlight">
      <strong>${preConNumber}</strong><br>
       <strong>${location}</strong><br>
       <strong>MAY 13, 2026</strong><br>
       <strong>8:00-11:30 AM</strong><br>
       <strong>3 Approved CPD Units</strong>
    </div>
    
    <p>We are looking forward to a productive morning of learning with you!</p>
    
    <p style="text-align: center; font-size: 14px; color: #217d05; font-weight: bold; margin: 25px 0;">
      See you there, Colleagues!
    </p>
  </div>
  
  <div class="footer">
    <p>${eventName} Team</p>
  </div>
</body>
</html>`;

  // Confirmation dialog
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    `Send Pre-Con ${preConNumber}?`,
    `📧 To: ${email}\n👤 ${name}\n📍 ${location}`,
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    ui.alert("Cancelled.");
    return;
  }

  try {
    // Send beautiful HTML email
    GmailApp.sendEmail(email, subject, "", {
      htmlBody: htmlBody,
      name: eventName
    });

    // Update/create status columns (auto-creates if missing)
    if (cols.status === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue("Pre-Con Status");
      cols.status = sheet.getLastColumn();
    }
    if (cols.sentAt === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue("Pre-Con Sent At");
      cols.sentAt = sheet.getLastColumn();
    }

    sheet.getRange(row, cols.status).setValue(`PRE-CON ${preConNumber} SENT`);
    sheet.getRange(row, cols.sentAt).setValue(new Date());

    ui.alert(`✅ Pre-Con ${preConNumber} email sent successfully!\n\n📧 ${email}`);
    
  } catch (error) {
    ui.alert(`❌ Failed to send: ${error.toString()}`);
    Logger.log(`Pre-Con email error for ${email}: ${error}`);
  }
}

/*************************************************
 * PRE-CON SETUP TEST
 *************************************************/

function testPreConSetup() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cols = getPreConColumns(sheet);
  
  Logger.log("=== PRE-CON SETUP TEST ===");
  Logger.log("Sheet: " + sheet.getName());
  Logger.log("Email Col: " + (cols.email > 0 ? cols.email : "NOT FOUND"));
  Logger.log("Name Col: " + (cols.name > 0 ? cols.name : "NOT FOUND"));
  Logger.log("Status Col: " + cols.status);
  Logger.log("SentAt Col: " + cols.sentAt);
  
  var rowValues = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log("Sample Row 2 - Email: " + (cols.email > 0 ? rowValues[cols.email-1] : "N/A"));
  Logger.log("Sample Row 2 - Name: " + (cols.name > 0 ? extractFullName(rowValues, getColumnMap(sheet)) : "N/A"));
  
  SpreadsheetApp.getUi().alert("✅ Pre-Con setup OK!\nCheck View > Logs for details.");
}