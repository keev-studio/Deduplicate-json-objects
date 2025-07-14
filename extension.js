const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Optimized function to remove duplicate objects while preserving exact formatting
 */
function removeObjectsPreservingFormat(text, indicesToRemove) {
    if (indicesToRemove.length === 0) return text;
    
    const lines = text.split('\n');
    const result = [];
    const removeSet = new Set(indicesToRemove); // O(1) lookup instead of O(n)
    
    let bracketDepth = 0;
    let inObject = false;
    let currentObjectIndex = -1;
    let skipObject = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Track bracket depth and object boundaries
        if (trimmed === '{') {
            bracketDepth++;
            if (bracketDepth === 2) { // Top-level object (depth 2 because array is depth 1)
                inObject = true;
                currentObjectIndex++;
                skipObject = removeSet.has(currentObjectIndex);
            }
        }
        
        if (trimmed.includes('}')) {
            const closingBrackets = (trimmed.match(/}/g) || []).length;
            bracketDepth -= closingBrackets;
            
            if (bracketDepth === 1 && inObject) { // End of top-level object
                inObject = false;
                if (skipObject) {
                    skipObject = false;
                    continue; // Skip this closing line
                }
            }
        }
        
        // Skip lines if we're removing this object
        if (!skipObject) {
            result.push(line);
        }
    }
    
    return cleanupCommas(result);
}

/**
 * Optimized comma cleanup - works directly on array to avoid string operations
 */
function cleanupCommas(lines) {
    const result = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();
        
        // Handle trailing comma before closing bracket
        if (trimmed.endsWith('},') || trimmed.endsWith('}')) {
            // Look ahead for closing bracket
            for (let j = i + 1; j < lines.length; j++) {
                const nextTrimmed = lines[j].trim();
                if (nextTrimmed === '') continue; // Skip empty lines
                
                if (nextTrimmed === ']') {
                    // Remove trailing comma
                    line = line.replace(/,(\s*)$/, '$1');
                }
                break;
            }
        }
        
        // Skip empty lines that would create syntax errors
        if (trimmed === ',' && result.length > 0) {
            const lastTrimmed = result[result.length - 1].trim();
            if (lastTrimmed === '[' || lastTrimmed === '') {
                continue;
            }
        }
        
        result.push(line);
    }
    
    return result.join('\n');
}

/**
 * Single-pass JSON parsing to find duplicates
 */
function findDuplicateIndices(jsonData, selectedKey) {
    const seenValues = new Map();
    const indicesToRemove = [];
    
    for (let i = 0; i < jsonData.length; i++) {
        const item = jsonData[i];
        const keyValue = item[selectedKey];
        
        if (keyValue === undefined) continue;
        
        const keyStr = typeof keyValue === 'string' ? keyValue : JSON.stringify(keyValue);
        
        if (seenValues.has(keyStr)) {
            indicesToRemove.push(i);
        } else {
            seenValues.set(keyStr, i); // Store index for potential future use
        }
    }
    
    return indicesToRemove;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Deduplicate Objects from JSON is now active');

    let disposable = vscode.commands.registerCommand('deduplicate-json-objects.removeDuplicates', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found. Please open a JSON file.');
            return;
        }

        const fileName = editor.document.fileName;
        if (path.extname(fileName).toLowerCase() !== '.json') {
            vscode.window.showErrorMessage('The active file is not a JSON file.');
            return;
        }

        try {
            const document = editor.document;
            const text = document.getText();
            
            // Single JSON parse for validation and processing
            let jsonData;
            try {
                jsonData = JSON.parse(text);
            } catch (e) {
                vscode.window.showErrorMessage('Invalid JSON format: ' + e.message);
                return;
            }

            // Early validation
            if (!Array.isArray(jsonData)) {
                vscode.window.showErrorMessage('The JSON file must contain an array of objects.');
                return;
            }

            if (jsonData.length === 0) {
                vscode.window.showInformationMessage('The JSON array is empty. Nothing to deduplicate.');
                return;
            }

            // Get available keys
            const sampleObj = jsonData[0];
            if (typeof sampleObj !== 'object' || sampleObj === null) {
                vscode.window.showErrorMessage('The JSON array must contain objects.');
                return;
            }

            const keys = Object.keys(sampleObj);
            if (keys.length === 0) {
                vscode.window.showErrorMessage('Objects in the array have no properties to compare.');
                return;
            }
            
            // User key selection
            const selectedKey = await vscode.window.showQuickPick(keys, {
                placeHolder: 'Select a property to use for duplicate comparison',
                canPickMany: false
            });

            if (!selectedKey) return; // User cancelled

            // Find duplicates in single pass
            const indicesToRemove = findDuplicateIndices(jsonData, selectedKey);
            
            if (indicesToRemove.length === 0) {
                vscode.window.showInformationMessage('No duplicates found.');
                return;
            }

            // Remove objects while preserving formatting
            const resultText = removeObjectsPreservingFormat(text, indicesToRemove);

            // Apply edit
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, fullRange, resultText);
            await vscode.workspace.applyEdit(edit);

            // Success message
            const remainingCount = jsonData.length - indicesToRemove.length;
            vscode.window.showInformationMessage(
                `Removed ${indicesToRemove.length} duplicate(s) based on "${selectedKey}". ${remainingCount} unique item(s) remain.`
            );

        } catch (error) {
            vscode.window.showErrorMessage('Error processing JSON: ' + error.message);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
