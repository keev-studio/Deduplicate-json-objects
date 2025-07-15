const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Detects the most common indentation used in a JSON string with high accuracy
 * @param {string} text - The JSON text to analyze
 * @returns {string|number} - The detected indentation (string for tabs, number for spaces)
 */
function detectIndentation(text) {
    const lines = text.split('\n');
    const indentationSamples = [];
    const tabCount = [];
    let hasTabIndentation = false;
    let hasSpaceIndentation = false;
    
    // Analyze each line for indentation patterns
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Skip empty lines and lines with only closing brackets/braces
        if (trimmed === '' || trimmed.match(/^[\}\]],?$/)) {
            continue;
        }
        
        // Check for leading whitespace
        const match = line.match(/^(\s+)/);
        if (match) {
            const whitespace = match[1];
            
            // Check for tabs
            if (whitespace.includes('\t')) {
                hasTabIndentation = true;
                const tabOnlyMatch = whitespace.match(/^\t+/);
                if (tabOnlyMatch) {
                    tabCount.push(tabOnlyMatch[0].length);
                }
            }
            
            // Check for spaces (only if no tabs in this line)
            if (!whitespace.includes('\t') && whitespace.length > 0) {
                hasSpaceIndentation = true;
                indentationSamples.push(whitespace.length);
            }
        }
    }
    
    // If we found both tabs and spaces, determine which is more common
    if (hasTabIndentation && hasSpaceIndentation) {
        // Count lines with tabs vs spaces
        let tabLines = 0;
        let spaceLines = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^(\s+)/);
            if (match) {
                if (match[1].includes('\t')) {
                    tabLines++;
                } else {
                    spaceLines++;
                }
            }
        }
        
        // Use the more common indentation type
        if (tabLines > spaceLines) {
            return '\t';
        }
        // Continue with space analysis below
    } else if (hasTabIndentation) {
        return '\t';
    }
    
    // Analyze space indentation patterns
    if (indentationSamples.length === 0) {
        return 2; // Default fallback
    }
    
    // Find the most likely base indentation unit
    const possibleUnits = [2, 3, 4, 5, 6, 8];
    const unitScores = new Map();
    
    // Score each possible unit based on how well it explains the indentation samples
    for (const unit of possibleUnits) {
        let score = 0;
        const levelCounts = new Map();
        
        for (const sample of indentationSamples) {
            const level = Math.round(sample / unit);
            const expectedIndent = level * unit;
            
            // Give higher score for exact matches
            if (sample === expectedIndent) {
                score += 10;
                levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
            }
            // Give lower score for close matches (off by 1)
            else if (Math.abs(sample - expectedIndent) <= 1) {
                score += 3;
                levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
            }
            // Penalize for poor matches
            else if (Math.abs(sample - expectedIndent) > 2) {
                score -= 2;
            }
        }
        
        // Bonus for having multiple samples at the same level (consistency)
        for (const count of levelCounts.values()) {
            if (count > 1) {
                score += count * 2;
            }
        }
        
        unitScores.set(unit, score);
    }
    
    // Find the unit with the highest score
    let bestUnit = 2;
    let bestScore = -Infinity;
    
    for (const [unit, score] of unitScores) {
        if (score > bestScore) {
            bestScore = score;
            bestUnit = unit;
        }
    }
    
    // Additional validation: check if the best unit makes sense
    if (bestScore > 0) {
        // Verify that the majority of samples are consistent with this unit
        let consistentSamples = 0;
        for (const sample of indentationSamples) {
            const level = Math.round(sample / bestUnit);
            const expectedIndent = level * bestUnit;
            if (Math.abs(sample - expectedIndent) <= 1) {
                consistentSamples++;
            }
        }
        
        // If less than 60% of samples are consistent, fall back to most common sample
        if (consistentSamples / indentationSamples.length < 0.6) {
            return getMostCommonIndentation(indentationSamples);
        }
    }
    
    return bestUnit;
}

/**
 * Fallback method: find the most frequently occurring indentation
 * @param {number[]} samples - Array of indentation samples
 * @returns {number} - Most common indentation
 */
function getMostCommonIndentation(samples) {
    const frequency = new Map();
    
    for (const sample of samples) {
        frequency.set(sample, (frequency.get(sample) || 0) + 1);
    }
    
    let mostCommon = 2;
    let maxCount = 0;
    
    for (const [indent, count] of frequency) {
        if (count > maxCount) {
            maxCount = count;
            mostCommon = indent;
        }
    }
    
    return mostCommon;
}

/**
 * Enhanced version with debugging info (optional)
 * @param {string} text - The JSON text to analyze
 * @param {boolean} debug - Whether to log debugging information
 * @returns {object} - Object with detected indentation and debug info
 */
function detectIndentationWithDebug(text, debug = false) {
    const lines = text.split('\n');
    const indentationSamples = [];
    const debugInfo = {
        totalLines: lines.length,
        analyzedLines: 0,
        samples: [],
        hasTabIndentation: false,
        hasSpaceIndentation: false
    };
    
    // Collect all indentation samples
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (trimmed === '' || trimmed.match(/^[\}\]],?$/)) {
            continue;
        }
        
        const match = line.match(/^(\s+)/);
        if (match) {
            const whitespace = match[1];
            debugInfo.analyzedLines++;
            
            if (whitespace.includes('\t')) {
                debugInfo.hasTabIndentation = true;
                if (debug) debugInfo.samples.push(`Line ${i + 1}: TAB`);
            } else {
                debugInfo.hasSpaceIndentation = true;
                indentationSamples.push(whitespace.length);
                if (debug) debugInfo.samples.push(`Line ${i + 1}: ${whitespace.length} spaces`);
            }
        }
    }
    
    const detectedIndentation = detectIndentation(text);
    
    if (debug) {
        console.log('Indentation Detection Debug:', debugInfo);
        console.log('Detected indentation:', detectedIndentation);
    }
    
    return {
        indentation: detectedIndentation,
        debugInfo: debugInfo
    };
}

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

            // Detect original indentation with enhanced accuracy
            const originalIndentation = detectIndentation(text);

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

            // Format the output JSON with the detected indentation
            const resultJson = JSON.stringify(uniqueData, null, originalIndentation);

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
    deactivate,
    detectIndentation,
    detectIndentationWithDebug
};
