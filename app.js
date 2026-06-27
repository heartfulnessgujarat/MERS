const FIREBASE_BASE_URL = "https://mers-june2026-default-rtdb.asia-southeast1.firebasedatabase.app/";

let controlTower = null;
let currentEvent = null;
let currentEventId = "";

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    currentEventId = urlParams.get('event_id') || "HC-OUTREACH-2026"; 
    
    try {
        const res = await fetch(`${FIREBASE_BASE_URL}form_control_tower.json?nocache=${new Date().getTime()}`);
        controlTower = await res.json();
        
        if (!controlTower) throw new Error("Failed to load schema.");
        
        currentEvent = controlTower.events ? controlTower.events[currentEventId] : null;
        if (!currentEvent) {
            showSystemMessage(`Event ID '${currentEventId}' not found.`, "error");
            return;
        }
        
        document.getElementById("app-event-title").innerText = currentEventId;
        document.getElementById("app-event-subtitle").innerText = `Status: ${currentEvent.event_status}`;
        
        buildDynamicFormFields();
        document.getElementById("mers-dynamic-form").classList.remove("hidden");
        
    } catch (err) {
        showSystemMessage(`Error: ${err.message}`, "error");
    }
}

function buildDynamicFormFields() {
    const sectionContainer = document.getElementById("dynamic-sections-container");
    sectionContainer.innerHTML = "";

    const eventSectionsObj = controlTower.sections[currentEventId];
    const eventFieldsObj = controlTower.fields[currentEventId];

    // Order items organically using row_sequence values passed from sheet
    const sortedSections = Object.values(eventSectionsObj).sort((a, b) => a.row_sequence - b.row_sequence);
    const sortedFields = Object.values(eventFieldsObj).sort((a, b) => a.row_sequence - b.row_sequence);

    sortedSections.forEach(sec => {
        const sectionBlock = document.createElement("div");
        sectionBlock.id = `section_element_${sec.section_id}`;
        sectionBlock.setAttribute("data-conditional-rule", sec.conditional_show_rule || "always");
        sectionBlock.className = "space-y-4 my-6 p-4 border-l-4 border-indigo-500 bg-slate-50/50 rounded-r-lg";
        
        const header = document.createElement("h3");
        header.className = "text-lg font-bold text-slate-800 mb-2";
        header.innerText = sec.section_title;
        sectionBlock.appendChild(header);

        // Filter fields belonging strictly to this section in true sheet order
        const sectionFields = sortedFields.filter(f => f.section_id === sec.section_id);
        
        sectionFields.forEach(f => {
            const wrapper = document.createElement("div");
            wrapper.className = "flex flex-col gap-1 mb-3 text-left";
            
            const label = document.createElement("label");
            label.className = "text-sm font-medium text-slate-700";
            label.innerHTML = f.field_label + (f.is_required === "Yes" ? ' <span class="text-red-500">*</span>' : '');
            wrapper.appendChild(label);

            let input = null;

            if (f.input_type === "dropdown" || f.input_type === "radio") {
                input = document.createElement("select");
                input.className = "w-full p-2 border border-slate-300 roundedbg-white outline-none focus:border-indigo-500";
                
                const listKey = f.master_source.includes("!") ? f.master_source.split("!")[1] : f.master_source;
                let options = controlTower.dropdown_masters ? controlTower.dropdown_masters[listKey] : [];
                
                if (f.input_type === "radio") options = ["Yes", "No"];

                const def = document.createElement("option");
                def.value = ""; def.innerText = `-- Select ${f.field_label} --`;
                input.appendChild(def);

                if (options) {
                    options.forEach(opt => {
                        const o = document.createElement("option");
                        o.value = opt; o.innerText = opt;
                        input.appendChild(o);
                    });
                }
            } else if (f.input_type === "textarea") {
                input = document.createElement("textarea");
                input.rows = 2;
                input.className = "w-full p-2 border border-slate-300 rounded outline-none focus:border-indigo-500";
            } else {
                input = document.createElement("input");
                input.type = f.input_type === "number" ? "number" : f.input_type === "date" ? "date" : "text";
                input.className = "w-full p-2 border border-slate-300 rounded outline-none focus:border-indigo-500";
            }

            input.name = f.system_id;
            input.id = `input_${f.system_id}`;
            if (f.is_required === "Yes") input.required = true;
            
            input.addEventListener("input", handleVisibilityBranching);
            input.addEventListener("change", handleVisibilityBranching);

            wrapper.appendChild(input);
            sectionBlock.appendChild(wrapper);
        });

        sectionContainer.appendChild(sectionBlock);
    });

    handleVisibilityBranching();
}

function handleVisibilityBranching() {
    const eventSectionsObj = controlTower.sections[currentEventId];
    if (!eventSectionsObj) return;

    Object.keys(eventSectionsObj).forEach(secId => {
        const block = document.getElementById(`section_element_${secId}`);
        if (!block) return;

        const rule = block.getAttribute("data-conditional-rule");
        let show = true;

        if (rule !== "always" && rule.includes("==")) {
            const [fId, target] = rule.split("==");
            const val = document.getElementById(`input_${fId.trim()}`)?.value || "";
            show = (val === target.trim().replace(/['"]/g, ""));
        }

        if (show) {
            block.classList.remove("hidden");
            block.querySelectorAll("input, select, textarea").forEach(i => {
                const conf = controlTower.fields[currentEventId][i.name];
                if (conf?.is_required === "Yes") i.required = true;
            });
        } else {
            block.classList.add("hidden");
            block.querySelectorAll("input, select, textarea").forEach(i => i.required = false);
        }
    });
}

// THE ZERO-HARDCODING RULES INTERPRETER
function validateFieldInput(sysId, value) {
    const config = controlTower.fields[currentEventId][sysId];
    if (!config || value === "") return true;

    const rule = config.validation_rule;
    if (!rule || rule === "none") return true;

    const resolveValue = (token) => {
        token = token.trim();
        if (token.startsWith("lookup:")) return Number(currentEvent[token.replace("lookup:", "")]) || 0;
        if (token.startsWith("input_lookup:")) return Number(document.getElementById(`input_${token.replace("input_lookup:", "")}`)?.value) || 0;
        return Number(token) || 0;
    };

    // 1. Text Filters
    if (rule === "TEXT" && !/^[A-Za-z\s]+$/.test(value)) return "Field must contain text letters only.";
    if (rule === "MOB" && !/^[0-9]{10}$/.test(value)) return "Must be an active 10 digit phone number.";

    // 2. Range Interpreter: NUM_RANGE(min, max)
    if (rule.startsWith("NUM_RANGE")) {
        const limits = rule.match(/NUM_RANGE\(([^,]+),([^)]+)\)/);
        if (limits) {
            const min = resolveValue(limits[1]);
            const max = resolveValue(limits[2]);
            const num = Number(value);
            if (num < min || num > max) return `Value violation! Range boundary allowed: ${min} to ${max}.`;
        }
    }

    // 3. Date Formula Interpreter
    if (rule.startsWith("DATE_AFTER")) {
        const dependentField = rule.match(/DATE_AFTER\(lookup:([^)]+)\)/)?.[1];
        const baseDateVal = document.getElementById(`input_${dependentField}`)?.value;
        if (baseDateVal && new Date(value) <= new Date(baseDateVal)) {
            return "Execution window sequence error! End date must fall after the starting date.";
        }
    }

    if (rule.startsWith("DATE_MIN")) {
        const today = new Date().setHours(0,0,0,0);
        const targetDate = new Date(value).setHours(0,0,0,0);

        if (rule.includes("IF")) {
            // Evaluates compound conditional logic sentences written in sheet rows
            const hoursValue = Number(document.getElementById("input_workshop_hours")?.value) || 0;
            const daysRequired = hoursValue <= 8 ? resolveValue("lookup:short_hours_prep_days") : resolveValue("lookup:long_hours_prep_days");
            
            if (targetDate < (today + (daysRequired * 86400000))) {
                return `Administration Rule Exception: This timeline profile demands a minimum of ${daysRequired} logistics planning days.`;
            }
        } else if (targetDate < today) {
            return "Historical lock error: Selected dates cannot reside in the past.";
        }
    }

    return true;
}

document.getElementById("mers-dynamic-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = { timestamp: new Date().toISOString() };
    let valid = true;

    for (let [key, value] of formData.entries()) {
        const field = document.getElementById(`input_${key}`);
        if (field && field.offsetParent === null) continue; // Skip validations on hidden structural blocks

        const check = validateFieldInput(key, value);
        if (check !== true) {
            valid = false;
            field.setCustomValidity(check);
            field.reportValidity();
            field.focus();
            return;
        } else {
            field.setCustomValidity("");
        }
        payload[key] = controlTower.fields[currentEventId][key]?.input_type === "number" ? Number(value) : value;
    }

    if (!valid) return;

    try {
        await fetch(`${FIREBASE_BASE_URL}submissions/${currentEventId}.json`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        alert("Registration Submitted Successfully! 🎉");
        e.target.reset();
        handleVisibilityBranching();
    } catch (err) {
        alert(`System Offline: ${err.message}`);
    }
});

function showSystemMessage(text, type) {
    const box = document.getElementById("system-alert");
    box.innerText = text;
    box.className = `p-4 rounded mb-4 text-center font-bold ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`;
    box.classList.remove("hidden");
}

window.onload = init;
