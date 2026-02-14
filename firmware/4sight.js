// 4sight - Bangle.js 2 Sensor Data Logger (Espruino 2v28+)
// Records PPG (25Hz), Accelerometer (12.5Hz), Temperature (0.1Hz)
// Data saved as 1-minute CSV windows to StorageFile
//
// CSV schemas (no header rows):
//   4s_P_XXXX (PPG):   ts,raw
//   4s_A_XXXX (Accel): ts,x,y,z
//   4s_T_XXXX (Temp):  ts,temp,press,alt
// ts = milliseconds since window start

var APP_ID = "4sight";
var WINDOW_MS = 60000;

var winIdx = 0;
var winStart = 0;
var fPPG, fACC, fTMP;

function pad(n) {
  return ("0000" + n).slice(-4);
}

function openWindow() {
  var p = pad(winIdx);
  fPPG = require("Storage").open("4s_P_" + p, "a");
  fACC = require("Storage").open("4s_A_" + p, "a");
  fTMP = require("Storage").open("4s_T_" + p, "a");
  winStart = getTime();
  winIdx++;
}

function onHRM(d) {
  var t = Math.round((getTime() - winStart) * 1000);
  fPPG.write(t + "," + d.raw + "\n");
}

function onAccel(d) {
  var t = Math.round((getTime() - winStart) * 1000);
  fACC.write(t + "," + d.x.toFixed(4) + "," + d.y.toFixed(4) + "," + d.z.toFixed(4) + "\n");
}

function onTemp() {
  Bangle.getPressure().then(function(d) {
    if (!d) return;
    var t = Math.round((getTime() - winStart) * 1000);
    fTMP.write(t + "," + d.temperature.toFixed(2) + "," + d.pressure.toFixed(2) + "," + d.altitude.toFixed(1) + "\n");
  });
}

function start() {
  // Configure before powering on sensors
  Bangle.setOptions({ powerSave: false, hrmPollInterval: 40 });

  // Power on sensors
  Bangle.setHRMPower(1, APP_ID);
  Bangle.setBarometerPower(1, APP_ID);

  // Open first recording window
  openWindow();

  // Register sensor callbacks
  Bangle.on('HRM-raw', onHRM);
  Bangle.on('accel', onAccel);

  // Temperature every 10s, window rotation every 60s
  setInterval(onTemp, 10000);
  setInterval(openWindow, WINDOW_MS);

  // Minimal display
  g.clear();
  g.setFont("6x8");
  g.drawString("4sight logging", 10, 10);
}

start();
