
const archiver = require('archiver');
const express = require("express");
const cors = require('cors');
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
const uuid = require('uuid');
const url = require('url');
const http = require('http');
const fs = require('fs');
const path = require('path');
const log4js = require('log4js');
const os = require("os");