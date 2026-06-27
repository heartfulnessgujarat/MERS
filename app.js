// Global Configuration mapping straight to your functional database
const FIREBASE_BASE_URL = "https://mers-june2026-default-rtdb.asia-southeast1.firebasedatabase.app/";

let controlTower = null;
let currentEvent = null;
let currentEventId = "";

// Initialize application lifecycle
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    currentEventId = urlParams.get('event_id') || "HC-OUTREACH-2026"; 
    
    try {
        const res = await fetch(`${FIREBASE_BASE_URL}form_control_tower.json`);
        controlTower = await res.json();
        
        if (!controlTower) throw new Error("Could not download Control Tower data schema.");
        
        currentEvent = controlTower.events ? controlTower.events[currentEventId] : null;
        if (!currentEvent) {
            showSystemMessage(`Error: Event ID '${currentEventId}' does not exist inside Control Tower configuration.`, "error");
            return;
        }

        if (currentEvent.event_status === "NOT_ACTIVE") {
            showSystemMessage("This registration form is currently closed by the administrator.", "warning");
            return;
        }
        
        document.getElementById("app-event-title").innerText = currentEventId;
        document.getElementById("app-event-subtitle").innerText = `Status: ${currentEvent.event_status} | Type: ${currentEvent.event_type}`;
        
        buildDynamicFormFields();
        document.getElementById("mers-dynamic-form").classList.remove("hidden");
        
    } catch (err) {
        showSystemMessage(`Initialization Failure: ${err.message}`, "error");
    }
}

// Draw sections and fields dynamically matching your Sheet configurations
function buildDynamicFormFields() {
    const sectionContainer = document.getElementById("dynamic-sections-container");
    sectionContainer.innerHTML = "";

    const eventSectionsObj = controlTower.sections ? controlTower.sections[currentEventId] : null;
    const eventFieldsObj = controlTower.fields ? controlTower.fields[currentEventId] : null;

    if (!eventSectionsObj || !eventFieldsObj) {
        showSystemMessage(`Error: No fields or sections mapped for Event ID '${currentEventId}' inside the database.`, "error");
        return;
    }

    const sortedSections = Object.values(eventSectionsObj).sort((a, b) => a.sequence - b.sequence);
    
    const fieldsBySection = {};
    Object.values(eventFieldsObj).forEach(field => {
        if (!fieldsBySection[field.section_id]) fieldsBySection[field.section_id] = [];
        fieldsBySection[field.section_id].push(field);
    });

    sortedSections.forEach(sec => {
        const sectionBlock = document.createElement("div");
        sectionBlock.id = `section_element_${sec.section_id}`;
        sectionBlock.setAttribute("data-conditional-rule", sec.conditional_show_rule || "always");
        sectionBlock.className = "space-y-4 border-l-4 border-slate-200 pl-4 md:pl-6 transition-all duration-300";
        
        const header = document.createElement("h3");
        header.className = "text-xl font-bold text-slate-700 tracking-wide mb-2";
        header.innerText = sec.section_title;
        sectionBlock.appendChild(header);

        const fields = fieldsBySection[sec.section_id] || [];
        fields.forEach(f => {
            const fieldWrapper = document.createElement("div");
            fieldWrapper.className = "flex flex-col gap-1.5 mb-4";
            
            const label = document.createElement("label");
            label.className = "text-sm font-semibold text-slate-600";
            label.innerHTML = f.field_label + (f.is_required === "Yes" ? ' <span class="text-red-500">*</span>' : '');
            fieldWrapper.appendChild(label);

            let inputElem = null;

            if (f.input_type === "dropdown") {
                inputElem = document.createElement("select");
                inputElem.className = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
                
                const listKey = f.master_source.split("!")[1] || f.master_source;
                const options = controlTower.dropdown_masters ? controlTower.dropdown_masters[listKey] : [];
                
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "";
                defaultOpt.innerText = `-- Choose ${listKey} --`;
                inputElem.appendChild(defaultOpt);

                if (options && options.length > 0) {
                    options.forEach(opt => {
                        const o = document.createElement("option");
                        o.value = opt;
                        o.innerText = opt;
                        inputElem.appendChild(o);
                    });
                }

            } else if (f.input_type === "textarea") {
                inputElem = document.createElement("textarea");
                inputElem.rows = 3;
                inputElem.className = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
            } else if (f.input_type === "radio") {
                inputElem = document.createElement("select");
                inputElem.className = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
                inputElem.innerHTML = `<option value="">-- Select Option --</option><option value="Yes">Yes</option><option value="No">No</option>`;
            } else {
                inputElem = document.createElement("input");
                inputElem.type = f.input_type === "number" ? "number" : f.input_type === "date" ? "date" : "text";
                inputElem.className = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
            }

            inputElem.name = f.system_id;
            inputElem.id = `input_${f.system_id}`;
            
            // Listen to any changes across any field to instantly trigger dynamic jump checks
            inputElem.addEventListener("input", handleVisibilityBranching);
            inputElem.addEventListener("change", handleVisibilityBranching);

            fieldWrapper.appendChild(inputElem);
            sectionBlock.appendChild(fieldWrapper);
        });

        sectionContainer.appendChild(sectionBlock);
    });

    handleVisibilityBranching();
}

// 🚀 ENGINE UPDATE: Dynamically evaluates conditional_show_rule values from the sheet
function handleVisibilityBranching() {
    const eventSectionsObj = controlTower.sections[currentEventId];
    if (!eventSectionsObj) return;

    Object.keys(eventSectionsObj).forEach(secId => {
        const sectionBlock = document.getElementById(`section_element_${secId}`);
        if (!sectionBlock) return;

        const rule = sectionBlock.getAttribute("data-conditional-rule");
        let shouldShow = true;

        if (rule !== "always" && rule) {
            try {
                // Parse expressions like: mode == 'Online'
                if (rule.includes("==")) {
                    const parts = rule.split("==");
                    const fieldId = parts[0].trim();
                    const targetValue = parts[1].trim().replace(/['"]/g, "");
                    const currentInputValue = document.getElementById(`input_${fieldId}`)?.value || "";
                    
                    shouldShow = (currentInputValue === targetValue);
                }
            } catch (e) {
                console.error("Error processing jump rule: ", rule, e);
            }
        }

        if (shouldShow) {
            sectionBlock.classList.remove("hidden");
            setInputsRequired(sectionBlock, true);
        } else {
            sectionBlock.classList.add("hidden");
            setInputsRequired(sectionBlock, false);
        }
    });
}

function setInputsRequired(parentContainer, statusValue) {
    const inputs = parentContainer.querySelectorAll("input, select, textarea");
    inputs.forEach(input => {
        const sysId = input.name;
        const eventFieldsObj = controlTower.fields[currentEventId];
        const configuration = eventFieldsObj ? eventFieldsObj[sysId] : null;
        if (configuration && configuration.is_required === "Yes") {
            input.required = statusValue;
        }
    });
}

// 🚀 ENGINE UPDATE: Parses spreadsheet styles validations (NUM_RANGE, MOB, TEXT, DATE)
function validateFieldInput(sysId, value) {
    const eventFieldsObj = controlTower.fields[currentEventId];
    const config = eventFieldsObj[sysId];
    if (!config || !value) return true;

    const rule = config.validation_rule;
    if (!rule || rule === "none") return true;

    // Helper to resolve sheet lookups like "lookup:hall_capacity"
    const resolveToken = (token) => {
        token = token.trim();
        if (token.startsWith("lookup:")) {
            const configKey = token.replace("lookup:", "");
            return Number(currentEvent[configKey]) || 0;
        }
        return Number(token) || 0;
    };

    // 1. Text Format Validations
    if (rule === "TEXT") {
        if (!/^[A-Za-z\s]+$/.test(value)) return "Must contain letters and spaces only.";
    }
    if (rule === "MOB") {
        if (!/^[0-9]{10}$/.test(value)) return "Must be a valid 10-digit mobile number.";
    }

    // 2. Numeric Range Validations: NUM_RANGE(min, max)
    if (rule.startsWith("NUM_RANGE")) {
        const match = rule.match(/NUM_RANGE\(([^,]+),([^)]+)\)/);
        if (match) {
            const min = resolveToken(match[1]);
            const max = resolveToken(match[2]);
            const numVal = Number(value);
            if (numVal < min || numVal > max) return `Value must be between ${min} and ${max}.`;
        }
    }

    // 3. Date Configuration Boundary Validations
    if (rule.startsWith("DATE_MIN") || rule.startsWith("DATE_AFTER")) {
        const inputDate = new Date(value).setHours(0,0,0,0);
        const today = new Date().setHours(0,0,0,0);

        if (rule.startsWith("DATE_AFTER")) {
            const match = rule.match(/DATE_AFTER\(lookup:([^)]+)\)/);
            if (match) {
                const dependentFieldId = match[1];
                const dependentValue = document.getElementById(`input_${dependentFieldId}`)?.value;
                if (dependentValue) {
                    const compareDate = new Date(dependentValue).setHours(0,0,0,0);
                    if (inputDate <= compareDate) return "Date must be after the requested start date.";
                }
            }
        }

        if (rule.startsWith("DATE_MIN")) {
            // Complex nested check implementation logic for Outreach Prep rules
            if (rule.includes("IF")) {
                const hoursVal = Number(document.getElementById("input_workshop_hours")?.value) || 0;
                const thresholdDays = hoursVal <= 8 ? resolveToken("lookup:short_hours_prep_days") : resolveToken("lookup:long_hours_prep_days");
                
                const minAllowedDate = today + (thresholdDays * 24 * 60 * 60 * 1000);
                if (inputDate < minAllowedDate) {
                    const dateString = new Date(minAllowedDate).toLocaleDateString();
                    return `This requires at least ${thresholdDays} days preparation. Earliest date: ${dateString}`;
                }
            }
        }
    }

    return true;
}

function showSystemMessage(text, type) {
    const box = document.getElementById("system-alert");
    box.innerText = text;
    box.className = `p-4 rounded-xl mb-6 font-semibold ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`;
    box.classList.remove("hidden");
}

document.getElementById("mers-dynamic-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const submissionPayload = { timestamp: new Date().toISOString() };
    const eventFieldsObj = controlTower.fields[currentEventId];

    let formsAreValid = true;

    // Process and validate inputs
    for (let [key, value] of formData.entries()) {
        const inputField = document.getElementById(`input_${key}`);
        if (inputField && inputField.offsetParent === null) continue; // Skip hidden section values

        // Run validation engine
        const validationCheck = validateFieldInput(key, value);
        if (validationCheck !== true) {
            formsAreValid = false;
            inputField.setCustomValidity(validationCheck);
            inputField.reportValidity();
            
            inputField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            inputField.focus();
            return; 
        } else {
            inputField.setCustomValidity("");
        }

        const fieldConfig = eventFieldsObj ? eventFieldsObj[key] : null;
        submissionPayload[key] = fieldConfig?.input_type === "number" ? Number(value) : value;
    }

    if (!formsAreValid) return;

    try {
        const writeEndpoint = `${FIREBASE_BASE_URL}submissions/${currentEventId}.json`;
        const response = await fetch(writeEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(submissionPayload)
        });

        if (!response.ok) throw new Error("Database server rejected entry payload.");

        alert("Registration Submitted Successfully! 🎉");
        e.target.reset();
        handleVisibilityBranching();

    } catch (err) {
        alert(`Submission failed: ${err.message}`);
    }
});

window.onload = init;
