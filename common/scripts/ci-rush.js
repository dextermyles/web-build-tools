"use strict";
// This script is invoked by the CI build, via a build definition step.
//
// 'npm install @microsoft/rush -g' will always delete and recreate the rush
// global folder, even if it is already up to date. This causes a race condition
// when multiple builds are running simultaneously on the same build machine.
//
// As a workaround, this script checks whether Rush is up to date before
// running the command.
Object.defineProperty(exports, "__esModule", { value: true });
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const PACKAGE_NAME = '@microsoft/rush';
const RUSH_JSON_FILENAME = 'rush.json';
let rushJsonDirectory = undefined;
let basePath = __dirname;
let tempPath = __dirname;
do {
    const testRushJsonPath = path.join(basePath, RUSH_JSON_FILENAME);
    if (fs.existsSync(testRushJsonPath)) {
        rushJsonDirectory = basePath;
        break;
    }
    else {
        basePath = tempPath;
    }
} while (basePath !== (tempPath = path.resolve(basePath, '..'))); // Exit the loop when we hit the disk root
if (!rushJsonDirectory) {
    console.error('Unable to find rush.json.');
    process.exit(1);
}
let expectedVersion = undefined;
const rushJsonPath = path.join(rushJsonDirectory, RUSH_JSON_FILENAME);
try {
    const rushJsonContents = fs.readFileSync(rushJsonPath, 'UTF-8');
    // Use a regular expression to parse out the rushVersion value because rush.json supports comments,
    // but JSON.parse does not and we don't want to pull in more dependencies than we need to in this script.
    const rushJsonMatches = rushJsonContents.match(/\"rushVersion\"\s*\:\s*\"([0-9a-zA-Z.+\-]+)\"/);
    expectedVersion = rushJsonMatches[1];
}
catch (e) {
    console.error(`Unable to determine the required version of Rush from rush.json (${rushJsonDirectory}). ` +
        'The \'rushVersion\' field is either not assigned in rush.json or was specified ' +
        'using an unexpected syntax.');
    process.exit(1);
}
let npmPath = undefined;
try {
    if (os.platform() === 'win32') {
        // We're on Windows
        const whereOutput = childProcess.execSync('where npm', { stdio: [] }).toString();
        const lines = whereOutput.split(os.EOL).filter((line) => !!line);
        npmPath = lines[lines.length - 1];
    }
    else {
        // We aren't on Windows - assume we're on *NIX or Darwin
        npmPath = childProcess.execSync('which npm', { stdio: [] }).toString();
    }
}
catch (e) {
    console.error(`Unable to determine the path to the NPM tool: ${e}`);
    process.exit(1);
}
npmPath = npmPath.trim();
console.log(os.EOL + `NPM executable is '${npmPath}'`);
if (!fs.existsSync(npmPath)) {
    console.error('The NPM executable does not exist');
    process.exit(1);
}
const rushPathParts = ['common', 'temp', 'ci-rush'];
let rushPath = rushJsonDirectory;
for (const rushPathPart of rushPathParts) {
    rushPath = path.join(rushPath, rushPathPart);
    try {
        if (!fs.existsSync(rushPath)) {
            fs.mkdirSync(rushPath);
        }
    }
    catch (e) {
        console.error(`Error building local rush installation directory: ${e}`);
        process.exit(1);
    }
}
console.log(os.EOL + `Expected Rush version is ${expectedVersion}`);
// Check for the Rush version
let installedVersion = undefined;
let installedVersionValid = false;
try {
    const spawnResult = childProcess.spawnSync(npmPath, ['list', PACKAGE_NAME, 'version'], { cwd: rushPath, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = spawnResult.output.toString();
    const matches = /@microsoft\/rush\@([0-9a-zA-Z.+\-]+)/.exec(output);
    // If NPM finds the wrong version in node_modules, that version will be in matches[1].
    // But if it's not installed at all, then NPM instead uselessly tells us all about
    // the version that we DON'T have ('missing:')
    if (matches && matches.length === 2 && !output.match(/missing\:/g)) {
        installedVersion = matches[1];
        if (spawnResult.status === 0) {
            installedVersionValid = true;
        }
    }
}
catch (error) {
    // (this happens if we didn't find the installed package)
}
if (installedVersion) {
    console.log(os.EOL + `Installed version is ${installedVersion}`);
}
else {
    console.log(os.EOL + 'Rush does not appear to be installed');
}
if (!installedVersionValid || installedVersion !== expectedVersion) {
    const npmrcPath = path.join(rushJsonDirectory, 'common', 'config', 'rush', '.npmrc');
    const rushNpmrcPath = path.join(rushPath, '.npmrc');
    if (fs.existsSync(npmrcPath)) {
        try {
            let npmrcFileLines = fs.readFileSync(npmrcPath).toString().split('\n');
            npmrcFileLines = npmrcFileLines.map((line) => (line || '').trim());
            const resultLines = [];
            // Trim out lines that reference environment variables that aren't defined
            for (const line of npmrcFileLines) {
                const regex = /\$\{([^\}]+)\}/g; // This finds environment varible tokens that look like "${VAR_NAME}"
                const environmentVariables = line.match(regex);
                let lineShouldBeTrimmed = false;
                if (environmentVariables) {
                    for (const token of environmentVariables) {
                        // Remove the leading "${" and the trailing "}" from the token
                        const environmentVariableName = token.substring(2, token.length - 1);
                        if (!process.env[environmentVariableName]) {
                            lineShouldBeTrimmed = true;
                            break;
                        }
                    }
                }
                if (!lineShouldBeTrimmed) {
                    resultLines.push(line);
                }
            }
            fs.writeFileSync(rushNpmrcPath, resultLines.join(os.EOL));
        }
        catch (e) {
            console.error(`Error reading or writing .npmrc file: ${e}`);
            process.exit(1);
        }
    }
    const packageContents = {
        'name': 'ci-rush',
        'version': '0.0.0',
        'dependencies': {
            [PACKAGE_NAME]: expectedVersion
        },
        'description': 'DON\'T WARN',
        'repository': 'DON\'T WARN',
        'license': 'MIT'
    };
    const rushPackagePath = path.join(rushPath, 'package.json');
    fs.writeFileSync(rushPackagePath, JSON.stringify(packageContents, undefined, 2));
    console.log(os.EOL + 'Installing Rush...');
    childProcess.execSync(`"${npmPath}" install ${PACKAGE_NAME}@${expectedVersion}`, { cwd: rushPath });
    console.log(os.EOL + `Successfully installed Rush ${expectedVersion}`);
}

//# sourceMappingURL=ci-rush.js.map
