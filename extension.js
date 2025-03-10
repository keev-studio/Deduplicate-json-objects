const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Deduplicate Objects from JSON is now active');

    let disposable = vscode.commands.registerCommand('deduplicate-json-objects.removeDuplicates', async function () {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found. Please open a JSON file.');
            return;
        }

        // Check if the file is a JSON file
        const fileName = editor.document.fileName;
        if (path.extname(fileName).toLowerCase() !== '.json') {
            vscode.window.showErrorMessage('The active file is not a JSON file.');
            return;
        }

        try {
            // Get the content of the file
            const document = editor.document;
            const text = document.getText();
            let jsonData;

            try {
                jsonData = JSON.parse(text);
            } catch (e) {
                vscode.window.showErrorMessage('Invalid JSON format: ' + e.message);
                return;
            }

            // Check if the JSON is an array of objects
            if (!Array.isArray(jsonData)) {
                vscode.window.showErrorMessage('The JSON file must contain an array of objects.');
                return;
            }

            if (jsonData.length === 0) {
                vscode.window.showInformationMessage('The JSON array is empty. Nothing to deduplicate.');
                return;
            }

            // Get available keys to compare for duplication
            const sampleObj = jsonData[0];
            const keys = Object.keys(sampleObj);
            
            // Ask the user which key to use for comparison
            const selectedKey = await vscode.window.showQuickPick(keys, {
                placeHolder: 'Select a property to use for duplicate comparison',
                canPickMany: false
            });

            if (!selectedKey) {
                // User cancelled the operation
                return;
            }

            // Perform deduplication
            const uniqueMap = new Map();
            const uniqueData = [];

            for (const item of jsonData) {
                const key = item[selectedKey];
                
                if (key === undefined) {
                    continue; // Skip items that don't have the selected key
                }
                
                // Convert to string to handle objects or arrays as key values
                const keyStr = JSON.stringify(key);
                
                if (!uniqueMap.has(keyStr)) {
                    uniqueMap.set(keyStr, true);
                    uniqueData.push(item);
                }
            }

            // Count removed duplicates
            const removedCount = jsonData.length - uniqueData.length;

            // Format the output JSON with proper indentation
            const resultJson = JSON.stringify(uniqueData, null, 2);

            // Edit the file with the deduplicated JSON
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, fullRange, resultJson);
            await vscode.workspace.applyEdit(edit);

            // Show success message
            vscode.window.showInformationMessage(
                `Removed ${removedCount} duplicate(s) based on "${selectedKey}". ${uniqueData.length} unique item(s) remain.`
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