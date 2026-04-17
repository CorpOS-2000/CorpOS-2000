import { getState, patchState } from './gameState.js';
import { isInstallableApp, INSTALLABLE_APPS } from './installable-apps.js';

const PROG_FILES_PARENT = 'folder-progfiles';
const SYSTEM_PARENT = 'folder-system';

const APP_MANIFEST = Object.freeze({
  'worldnet': {
    folderName: 'WorldNet Explorer 5.0',
    exe: 'worldnet.exe',
    location: 'progfiles',
    files: [
      { name: 'worldnet.exe', size: 1843200, type: 'Application', critical: true },
      { name: 'wnetcore.dll', size: 524288, type: 'Application Extension', critical: true },
      { name: 'wnethtml.dll', size: 389120, type: 'Application Extension', critical: true },
      { name: 'wnetssl.dll', size: 143360, type: 'Application Extension', critical: false },
      { name: 'config.ini', size: 2048, type: 'Configuration Settings', critical: false,
        content: '[WorldNet Explorer 5.0]\r\nVersion=5.0.2195.1\r\nHomePage=http://www.wahoo.com\r\nSearchEngine=http://www.moogle.com\r\nProxy=none\r\nCacheSize=8192\r\nCookies=enabled\r\nJavaScript=enabled\r\nActiveX=prompt\r\nSSL2=yes\r\nSSL3=yes\r\nTLS1=yes\r\n' },
      { name: 'README.txt', size: 4096, type: 'Text Document',
        content: 'WorldNet Explorer 5.0\r\nCopyright (c) 2000 CorpOS Technologies, Inc.\r\n\r\nThank you for choosing WorldNet Explorer, the fastest\r\nway to browse the WorldNet.\r\n\r\nSystem Requirements:\r\n  - CorpOS 2000 or later\r\n  - 32 MB RAM (64 MB recommended)\r\n  - 40 MB available hard disk space\r\n\r\nFor support, visit http://www.devtools.net/support\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'herald': {
    folderName: 'Daily Herald Reader',
    exe: 'herald.exe',
    location: 'progfiles',
    files: [
      { name: 'herald.exe', size: 962560, type: 'Application', critical: true },
      { name: 'dhreader.dll', size: 286720, type: 'Application Extension', critical: true },
      { name: 'dhprint.dll', size: 102400, type: 'Application Extension', critical: false },
      { name: 'config.ini', size: 1536, type: 'Configuration Settings', critical: false,
        content: '[Daily Herald Reader]\r\nVersion=2.1.0\r\nAutoRefresh=300\r\nFontSize=medium\r\nShowImages=yes\r\nEdition=Metro\r\nSubscription=digital\r\n' },
      { name: 'EULA.txt', size: 6144, type: 'Text Document',
        content: 'END USER LICENSE AGREEMENT\r\nDaily Herald Digital Reader v2.1\r\n\r\nIMPORTANT: READ CAREFULLY BEFORE INSTALLING.\r\n\r\nThis software is licensed, not sold, by Daily Herald\r\nMedia Group. By installing this software you agree to\r\nthe terms of this license agreement.\r\n\r\n1. GRANT OF LICENSE. You may install one copy of this\r\n   software on a single computer.\r\n2. RESTRICTIONS. You may not reverse engineer, decompile,\r\n   or disassemble this software.\r\n3. TERMINATION. This license terminates if you fail to\r\n   comply with any term.\r\n\r\n(c) 2000 Daily Herald Media Group\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'writepad': {
    folderName: 'Writepad',
    exe: 'writepad.exe',
    location: 'progfiles',
    files: [
      { name: 'writepad.exe', size: 716800, type: 'Application', critical: true },
      { name: 'wpad.dll', size: 204800, type: 'Application Extension', critical: true },
      { name: 'spellcheck.dat', size: 1048576, type: 'DAT File', critical: false },
      { name: 'config.ini', size: 1024, type: 'Configuration Settings', critical: false,
        content: '[Writepad]\r\nVersion=1.4.0\r\nWordWrap=yes\r\nFont=Fixedsys\r\nFontSize=10\r\nTabSize=8\r\nStatusBar=yes\r\nRecentFiles=4\r\n' },
      { name: 'README.txt', size: 2048, type: 'Text Document',
        content: 'Writepad v1.4\r\nA simple text editor for CorpOS 2000.\r\n\r\nFeatures:\r\n  - Plain text editing\r\n  - Word wrap toggle\r\n  - Print support\r\n  - Find and Replace\r\n\r\n(c) 2000 CorpOS Technologies, Inc.\r\n' },
      { name: 'uninstall.dat', size: 512, type: 'DAT File', critical: false }
    ]
  },
  'tasks': {
    folderName: 'Task Handler',
    exe: 'taskhandler.exe',
    location: 'progfiles',
    files: [
      { name: 'taskhandler.exe', size: 573440, type: 'Application', critical: true },
      { name: 'taskcore.dll', size: 196608, type: 'Application Extension', critical: true },
      { name: 'procmon.dll', size: 143360, type: 'Application Extension', critical: false },
      { name: 'config.ini', size: 1024, type: 'Configuration Settings', critical: false,
        content: '[Task Handler]\r\nVersion=1.0.3\r\nRefreshRate=1000\r\nShowSystemTasks=no\r\nConfirmEndTask=yes\r\nPriorityBoost=auto\r\n' },
      { name: 'uninstall.dat', size: 512, type: 'DAT File', critical: false }
    ]
  },
  'media-player': {
    folderName: 'CorpOS Media Player',
    exe: 'mediaplayer.exe',
    location: 'progfiles',
    files: [
      { name: 'mediaplayer.exe', size: 2097152, type: 'Application', critical: true },
      { name: 'audiocore.dll', size: 655360, type: 'Application Extension', critical: true },
      { name: 'codec.dll', size: 409600, type: 'Application Extension', critical: true },
      { name: 'playlist.dll', size: 163840, type: 'Application Extension', critical: false },
      { name: 'visualize.dll', size: 245760, type: 'Application Extension', critical: false },
      { name: 'config.ini', size: 2048, type: 'Configuration Settings', critical: false,
        content: '[CorpOS Media Player]\r\nVersion=3.2.1\r\nOutputDevice=default\r\nBufferSize=64\r\nVisualization=bars\r\nShuffle=no\r\nRepeat=off\r\nVolume=80\r\nEQ_Bass=50\r\nEQ_Mid=50\r\nEQ_Treble=50\r\nSkinPack=classic\r\n' },
      { name: 'README.txt', size: 3072, type: 'Text Document',
        content: 'CorpOS Media Player v3.2\r\nThe ultimate audio experience for CorpOS 2000.\r\n\r\nSupported Formats:\r\n  MP3, WAV, OGG, WMA, MIDI\r\n\r\nFeatures:\r\n  - 3-band equalizer\r\n  - Multiple visualizations\r\n  - Playlist management\r\n  - Shuffle and repeat modes\r\n\r\nCodec pack included. Additional codecs available\r\nat http://www.devtools.net/codecs\r\n\r\n(c) 2000 CorpOS Technologies, Inc.\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'admin-web': {
    folderName: 'WebEdit Pro',
    exe: 'webedit.exe',
    location: 'progfiles',
    files: [
      { name: 'webedit.exe', size: 1536000, type: 'Application', critical: true },
      { name: 'webedit.dll', size: 409600, type: 'Application Extension', critical: true },
      { name: 'htmlparse.dll', size: 327680, type: 'Application Extension', critical: true },
      { name: 'cssengine.dll', size: 245760, type: 'Application Extension', critical: false },
      { name: 'config.cfg', size: 2048, type: 'Configuration Settings', critical: false,
        content: '# WebEdit Pro Configuration\r\n# Version 4.0.1\r\n\r\n[Editor]\r\nSyntaxHighlight=yes\r\nLineNumbers=yes\r\nAutoIndent=yes\r\nTabWidth=4\r\n\r\n[Preview]\r\nBrowser=internal\r\nAutoRefresh=yes\r\nRefreshDelay=500\r\n\r\n[FTP]\r\nPassiveMode=yes\r\nTimeout=30\r\nRetryCount=3\r\n' },
      { name: 'EULA.txt', size: 5120, type: 'Text Document',
        content: 'WebEdit Pro v4.0\r\nEnd User License Agreement\r\n\r\nThis software is provided by DevTools Software, Inc.\r\nLicensed for use on a single workstation.\r\n\r\nTHIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY\r\nOF ANY KIND. IN NO EVENT SHALL DEVTOOLS SOFTWARE BE\r\nLIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.\r\n\r\nRegistered to: [LICENSE HOLDER]\r\nSerial: WEP-4001-XXXX-XXXX\r\n\r\n(c) 2000 DevTools Software, Inc.\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'admin-company': {
    folderName: 'CompanyForge',
    exe: 'companyforge.exe',
    location: 'progfiles',
    files: [
      { name: 'companyforge.exe', size: 1310720, type: 'Application', critical: true },
      { name: 'cfcore.dll', size: 368640, type: 'Application Extension', critical: true },
      { name: 'cfdata.dll', size: 245760, type: 'Application Extension', critical: true },
      { name: 'cfreport.dll', size: 184320, type: 'Application Extension', critical: false },
      { name: 'config.ini', size: 1536, type: 'Configuration Settings', critical: false,
        content: '[CompanyForge]\r\nVersion=2.0.5\r\nDatabasePath=.\\data\r\nAutoSave=yes\r\nAutoSaveInterval=300\r\nBackupOnSave=yes\r\nMaxRecords=10000\r\nDefaultCurrency=USD\r\n' },
      { name: 'README.txt', size: 2048, type: 'Text Document',
        content: 'CompanyForge v2.0\r\nCorporate Records Management Tool\r\n\r\nCreate, manage, and audit company records within\r\nthe CorpOS business environment.\r\n\r\nFeatures:\r\n  - Company creation wizard\r\n  - Financial record tracking\r\n  - Employee roster management\r\n  - Compliance report generation\r\n\r\n(c) 2000 DevTools Software, Inc.\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'admin-npc': {
    folderName: 'ActorStudio',
    exe: 'actorstudio.exe',
    location: 'progfiles',
    files: [
      { name: 'actorstudio.exe', size: 1228800, type: 'Application', critical: true },
      { name: 'npccore.dll', size: 327680, type: 'Application Extension', critical: true },
      { name: 'npcgen.dll', size: 286720, type: 'Application Extension', critical: true },
      { name: 'portraits.dat', size: 2097152, type: 'DAT File', critical: false },
      { name: 'config.ini', size: 1536, type: 'Configuration Settings', critical: false,
        content: '[ActorStudio]\r\nVersion=1.3.2\r\nRegistryPath=.\\registry\r\nAutoGenerateSSN=yes\r\nDefaultAge=25-55\r\nPortraitPack=standard\r\nValidateOnSave=yes\r\n' },
      { name: 'README.txt', size: 2048, type: 'Text Document',
        content: 'ActorStudio v1.3\r\nActor Registry Management Tool\r\n\r\nGenerate and edit actors for the CorpOS citizen\r\nand corporate registries.\r\n\r\nFeatures:\r\n  - Procedural actor generation\r\n  - Portrait and identity management\r\n  - Relationship network editor\r\n  - Registry import/export\r\n\r\n(c) 2000 DevTools Software, Inc.\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'admin-gov': {
    folderName: 'GovAdmin Suite',
    exe: 'govadmin.exe',
    location: 'progfiles',
    files: [
      { name: 'govadmin.exe', size: 1572864, type: 'Application', critical: true },
      { name: 'govdata.dll', size: 491520, type: 'Application Extension', critical: true },
      { name: 'regcomp.dll', size: 327680, type: 'Application Extension', critical: true },
      { name: 'mandates.dat', size: 524288, type: 'DAT File', critical: false },
      { name: 'config.ini', size: 2048, type: 'Configuration Settings', critical: false,
        content: '[GovAdmin Suite]\r\nVersion=1.1.0\r\nJurisdiction=Federal\r\nComplianceLevel=standard\r\nAuditTrail=enabled\r\nEncryption=DES-56\r\nSessionTimeout=1800\r\nMaxMandates=500\r\n' },
      { name: 'EULA.txt', size: 5120, type: 'Text Document',
        content: 'GovAdmin Suite v1.1\r\nGovernment Data Management Platform\r\n\r\nLICENSE NOTICE: This software is classified for\r\nauthorized government use only. Unauthorized access\r\nor distribution is prohibited under Federal\r\nRegulation 47 CFR Part 15.\r\n\r\nAll data processed by this software is subject to\r\nFederal records retention policies.\r\n\r\nSerial: GAD-1100-XXXX-XXXX\r\n\r\n(c) 2000 DevTools Software, Inc.\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'admin-axis': {
    folderName: 'CCR Professional',
    exe: 'ccr.exe',
    location: 'progfiles',
    files: [
      { name: 'ccr.exe', size: 1146880, type: 'Application', critical: true },
      { name: 'axiscore.dll', size: 368640, type: 'Application Extension', critical: true },
      { name: 'axisnet.dll', size: 245760, type: 'Application Extension', critical: true },
      { name: 'contacts.dat', size: 163840, type: 'DAT File', critical: false },
      { name: 'config.ini', size: 1536, type: 'Configuration Settings', critical: false,
        content: '[CCR Professional]\r\nVersion=3.0.1\r\nAutoSync=yes\r\nSyncInterval=600\r\nMaxContacts=5000\r\nMaxContracts=1000\r\nNotifications=enabled\r\nDefaultView=profile\r\n' },
      { name: 'README.txt', size: 2048, type: 'Text Document',
        content: 'CCR Professional v3.0\r\nContacts, Contracts & Relations\r\n\r\nManage your professional network, track active\r\ncontracts, and monitor business relationships.\r\n\r\nFeatures:\r\n  - Contact directory with search\r\n  - Contract lifecycle management\r\n  - Relationship strength tracking\r\n  - Email and SMS integration\r\n\r\n(c) 2000 DevTools Software, Inc.\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'webex-publisher': {
    folderName: 'WebEx-Publisher',
    exe: 'webexpub.exe',
    location: 'progfiles',
    files: [
      { name: 'webexpub.exe', size: 1966080, type: 'Application', critical: true },
      { name: 'webex.dll', size: 573440, type: 'Application Extension', critical: true },
      { name: 'wxrender.dll', size: 409600, type: 'Application Extension', critical: true },
      { name: 'wxtemplate.dat', size: 819200, type: 'DAT File', critical: false },
      { name: 'config.cfg', size: 2048, type: 'Configuration Settings', critical: false,
        content: '# WebEx-Publisher Configuration\r\n# Version 2.5.0\r\n\r\n[Publisher]\r\nOutputFormat=HTML4\r\nAutoPublish=no\r\nDraftSaveInterval=120\r\nMaxModules=50\r\n\r\n[Commerce]\r\nPaymentGateway=integrated\r\nCurrency=USD\r\nTaxCalculation=auto\r\n\r\n[Hosting]\r\nDefaultHost=corpos.net\r\nBandwidthLimit=100MB\r\nSSL=available\r\n' },
      { name: 'README.txt', size: 3072, type: 'Text Document',
        content: 'WebEx-Publisher v2.5\r\nE-Commerce Website Builder\r\n\r\nBuild and publish professional e-commerce websites\r\nwith drag-and-drop modules.\r\n\r\nFeatures:\r\n  - Visual page builder\r\n  - Product catalog management\r\n  - Shopping cart integration\r\n  - Domain name registration\r\n  - One-click publishing\r\n\r\nTemplates included: 12 professional designs\r\n\r\n(c) 2000 DevTools Software, Inc.\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'webexploiter': {
    folderName: 'WebExploiter v1.0',
    exe: 'webexploit.exe',
    location: 'progfiles',
    files: [
      { name: 'webexploit.exe', size: 2097152, type: 'Application', critical: true },
      { name: 'wxcore.dll', size: 655360, type: 'Application Extension', critical: true },
      { name: 'wxcrypto.dll', size: 491520, type: 'Application Extension', critical: true },
      { name: 'wxnet.dll', size: 327680, type: 'Application Extension', critical: false },
      { name: 'exploits.dat', size: 1048576, type: 'DAT File', critical: false },
      { name: 'config.ini', size: 2048, type: 'Configuration Settings', critical: false,
        content: '[WebExploiter v1.0]\r\nVersion=1.0.0\r\nMode=standard\r\nMaxTargets=10\r\nCooldownMultiplier=1.0\r\nAutoLog=yes\r\nNotorietyTrack=enabled\r\nAnonymizer=off\r\n' },
      { name: 'README.txt', size: 3072, type: 'Text Document',
        content: 'WebExploiter v1.0\r\nCyber Operations Console\r\n\r\nTarget and degrade rival website statistics.\r\nAll attacks operate on real WorldNet site data.\r\n\r\nAttack types:\r\n  - Health Drain\r\n  - Traffic Flood\r\n  - Reputation Smear\r\n  - Security Breach\r\n  - Uptime Attack\r\n  - Full Takedown\r\n\r\nWARNING: Each attack increases your corporate\r\nnotoriety. Use with caution.\r\n\r\n(c) 2000 Underground Software Collective\r\n' },
      { name: 'uninstall.dat', size: 1024, type: 'DAT File', critical: false }
    ]
  },
  'explorer': {
    folderName: 'System Explorer',
    exe: 'explorer.exe',
    location: 'system',
    files: [
      { name: 'explorer.exe', size: 1048576, type: 'Application', critical: true, system: true, readonly: true },
      { name: 'shell32.dll', size: 819200, type: 'Application Extension', critical: true, system: true, readonly: true },
      { name: 'shlwapi.dll', size: 327680, type: 'Application Extension', critical: true, system: true, readonly: true },
      { name: 'explorer.ini', size: 1024, type: 'Configuration Settings', critical: false, system: true, readonly: true,
        content: '[System Explorer]\r\nVersion=5.0.2195.1\r\nShellIntegration=yes\r\nTreeView=enabled\r\nStatusBar=enabled\r\nAddress=enabled\r\n' }
    ]
  },
  'personal': {
    folderName: 'Profile Manager',
    exe: 'profile.exe',
    location: 'system',
    files: [
      { name: 'profile.exe', size: 614400, type: 'Application', critical: true, system: true, readonly: true },
      { name: 'profdata.dll', size: 245760, type: 'Application Extension', critical: true, system: true, readonly: true },
      { name: 'profile.ini', size: 512, type: 'Configuration Settings', critical: false, system: true, readonly: true,
        content: '[Profile Manager]\r\nVersion=1.0.0\r\nModule=personal\r\nReadOnly=no\r\n' }
    ]
  },
  'corporate': {
    folderName: 'Corporate Profile',
    exe: 'corpprofile.exe',
    location: 'system',
    files: [
      { name: 'corpprofile.exe', size: 655360, type: 'Application', critical: true, system: true, readonly: true },
      { name: 'corpdata.dll', size: 286720, type: 'Application Extension', critical: true, system: true, readonly: true },
      { name: 'corpprofile.ini', size: 512, type: 'Configuration Settings', critical: false, system: true, readonly: true,
        content: '[Corporate Profile]\r\nVersion=1.0.0\r\nModule=corporate\r\nReadOnly=no\r\n' }
    ]
  }
});

function folderId(appId) {
  return `pf-${appId}`;
}

function fileId(appId, index) {
  return `pf-${appId}-${index}`;
}

function parentForLocation(location) {
  return location === 'system' ? SYSTEM_PARENT : PROG_FILES_PARENT;
}

export function getAppProgramPath(appId) {
  const manifest = APP_MANIFEST[appId];
  if (!manifest) return null;
  if (manifest.location === 'system') {
    return `C:\\CORPOS\\SYSTEM\\${manifest.folderName}`;
  }
  return `C:\\Program Files\\${manifest.folderName}`;
}

export function seedProgramFiles(appId) {
  const manifest = APP_MANIFEST[appId];
  if (!manifest) return;

  const folderVfsId = folderId(appId);

  patchState((st) => {
    const entries = st.virtualFs.entries;
    if (entries.some((e) => e.id === folderVfsId)) return st;

    const now = new Date().toISOString();
    const parentId = parentForLocation(manifest.location);
    const isSystem = manifest.location === 'system';

    entries.push({
      id: folderVfsId,
      parentId,
      name: manifest.folderName,
      kind: 'folder',
      typeLabel: 'File Folder',
      size: '',
      description: '',
      created: now,
      modified: now,
      system: isSystem,
      readonly: isSystem
    });

    manifest.files.forEach((f, i) => {
      const entry = {
        id: fileId(appId, i),
        parentId: folderVfsId,
        name: f.name,
        kind: 'file',
        typeLabel: f.type,
        size: f.size,
        description: '',
        created: now,
        modified: now,
        system: !!f.system,
        readonly: !!f.readonly
      };
      if (f.content != null) entry.content = f.content;
      entries.push(entry);
    });

    return st;
  });
}

export function seedAllProgramFiles() {
  const st = getState();
  if (st.flags?._programFilesSeeded) return;

  const preInstalled = ['worldnet', 'herald', 'writepad', 'tasks', 'explorer', 'personal', 'corporate'];
  for (const id of preInstalled) {
    seedProgramFiles(id);
  }

  const installed = st.software?.installedAppIds || [];
  for (const id of installed) {
    seedProgramFiles(id);
  }

  patchState((s) => {
    if (!s.flags) s.flags = {};
    s.flags._programFilesSeeded = true;
    return s;
  });
}

export function verifyAppIntegrity(appId) {
  const manifest = APP_MANIFEST[appId];
  if (!manifest) return null;

  const entries = getState().virtualFs?.entries || [];
  const folderVfsId = folderId(appId);
  const folder = entries.find((e) => e.id === folderVfsId);
  const progPath = getAppProgramPath(appId);

  if (!folder) {
    return {
      type: 'missing_folder',
      title: `${manifest.exe} — Application Error`,
      message: `Windows cannot find '${progPath}\\${manifest.exe}'.`,
      detail: 'Make sure you typed the name correctly, and then try again. The application directory may have been deleted.'
    };
  }

  const children = entries.filter((e) => e.parentId === folderVfsId);
  const childNames = new Set(children.map((e) => e.name));

  if (!childNames.has(manifest.exe)) {
    return {
      type: 'missing_exe',
      title: `${manifest.exe} — Application Error`,
      message: `The file '${manifest.exe}' was not found in ${progPath}.`,
      detail: 'The application may have been moved or deleted. Please reinstall the application.'
    };
  }

  for (const f of manifest.files) {
    if (!f.critical) continue;
    if (f.name === manifest.exe) continue;
    if (!childNames.has(f.name)) {
      return {
        type: 'missing_dll',
        title: `${manifest.exe} — Entry Point Not Found`,
        message: `The required library '${f.name}' could not be located in ${progPath}.`,
        detail: 'The application cannot start because a required component is missing. Please reinstall the application.'
      };
    }
  }

  const missingConfigs = manifest.files.filter(
    (f) => !f.critical && /\.(ini|cfg|dat)$/i.test(f.name) && !childNames.has(f.name)
  );
  if (missingConfigs.length > 0) {
    return {
      type: 'missing_config',
      warnOnly: true,
      title: manifest.exe,
      message: `Configuration file '${missingConfigs[0].name}' is missing. Using default settings.`
    };
  }

  return null;
}

function ensureErrorOverlay() {
  let overlay = document.getElementById('corpos-app-error-dialog');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'corpos-app-error-dialog';
  overlay.className = 'corpos-app-error is-hidden';
  overlay.innerHTML = `
    <div class="corpos-app-error__panel" role="alertdialog" aria-modal="true" aria-labelledby="corpos-app-error-title">
      <div class="corpos-app-error__titlebar">
        <span class="corpos-app-error__title" id="corpos-app-error-title">Application Error</span>
      </div>
      <div class="corpos-app-error__body">
        <div class="corpos-app-error__icon">⚠</div>
        <div class="corpos-app-error__text">
          <div class="corpos-app-error__message" id="corpos-app-error-message"></div>
          <div class="corpos-app-error__detail" id="corpos-app-error-detail"></div>
        </div>
      </div>
      <div class="corpos-app-error__actions">
        <button type="button" class="corpos-app-error__btn" data-app-error-ok>OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function showAppErrorDialog({ title, message, detail }) {
  return new Promise((resolve) => {
    const overlay = ensureErrorOverlay();
    const titleEl = overlay.querySelector('#corpos-app-error-title');
    const msgEl = overlay.querySelector('#corpos-app-error-message');
    const detailEl = overlay.querySelector('#corpos-app-error-detail');
    const okBtn = overlay.querySelector('[data-app-error-ok]');
    if (!okBtn) { resolve(); return; }

    if (titleEl) titleEl.textContent = title || 'Application Error';
    if (msgEl) msgEl.textContent = message || '';
    if (detailEl) {
      detailEl.textContent = detail || '';
      detailEl.style.display = detail ? '' : 'none';
    }
    overlay.classList.remove('is-hidden');

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      overlay.classList.add('is-hidden');
      okBtn.removeEventListener('click', finish);
      overlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      resolve();
    };
    const onOverlay = (e) => { if (e.target === overlay) finish(); };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(); } };

    okBtn.addEventListener('click', finish);
    overlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => okBtn.focus());
  });
}

export { APP_MANIFEST };
