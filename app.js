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
        // Fetch layout details
        const res = await fetch(`${FIREBASE_BASE_URL}form_control_tower.json`);
        controlTower = await res.json();
        
        if (!controlTower) throw new Error("Could not download Control Tower data schema.");
        
        currentEvent = controlTower.events[currentEventId];
        if (!currentEvent) {
            showSystemMessage(`Error: Event ID '${currentEventId}' does not exist inside Control Tower configuration.`, "error");
            return;
        }

        // Validate Status Rules defined in your Event_Config tab
        if (currentEvent.event_status === "NOT_ACTIVE") {
            showSystemMessage("This registration form is currently closed by the administrator.", "warning");
            return;
        }
        
        document.getElementById("app-event-title").innerText = currentEventId;
        document.getElementById("app-event-subtitle").innerText = `Status: ${currentEvent.event_status} | Type: ${currentEvent.event_type}`;
        
        // Render out the layout
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

    // Sort sections using the sequence column value
    const sortedSections = Object.values(controlTower.sections).sort((a, b) => a.sequence - b.sequence);
    
    // Group field rule objects by section mapping row keys
    const fieldsBySection = {};
    Object.values(controlTower.fields).forEach(field => {
        if (!fieldsBySection[field.section_id]) fieldsBySection[field.section_id] = [];
        fieldsBySection[field.section_id].push(field);
    });

    sortedSections.forEach(sec => {
        const sectionBlock = document.createElement("div");
        sectionBlock.id = `section_element_${sec.section_id}`;
        sectionBlock.className = "space-y-4 border-l-4 border-slate-200 pl-4 md:pl-6 transition-all duration-300";
        
        // Section Title Header
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
                
                // Fetch drop values dynamically out of the master tab matrix matching column name
                const listKey = f.master_source.split("!")[1] || f.master_source;
                const options = controlTower.dropdown_masters[listKey] || [];
                
                // Default placeholder option
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "";
                defaultOpt.innerText = `-- Choose ${listKey} --`;
                inputElem.appendChild(defaultOpt);

                options.forEach(opt => {
                    const o = document.createElement("option");
                    o.value = opt;
                    o.innerText = opt;
                    inputElem.appendChild(o);
                });

                // Attach dynamic structural branching event tracking if the field is 'mode'
                if (f.system_id === "mode") {
                    inputElem.addEventListener("change", handleVisibilityBranching);
                }

            } else if (f.input_type === "textarea") {
                inputElem = document.createElement("textarea");
                inputElem.rows = 3;
                inputElem.className = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
            } else if (f.input_type === "radio") {
                // Simplified text input for yes/no radios to keep matching layouts pristine
                inputElem = document.createElement("select");
                inputElem.className = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
                inputElem.innerHTML = `<option value="">-- Select Option --</option><option value="Yes">Yes</option><option value="No">No</option>`;
            } else {
                // Handles base strings: numbers, standard text formats, date objects
                inputElem = document.createElement("input");
                inputElem.type = f.input_type === "number" ? "number" : f.input_type === "date" ? "date" : "text";
                inputElem.className = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
            }

            inputElem.name = f.system_id;
            inputElem.id = `input_${f.system_id}`;
            if (f.is_required === "Yes") inputElem.required = true;

            fieldWrapper.appendChild(inputElem);
            sectionBlock.appendChild(fieldWrapper);
        });

        sectionContainer.appendChild(sectionBlock);
    });

    // Run custom visibility loop to correctly position structural jumps right at launch
    handleVisibilityBranching();
}

// Enforces dynamic structural jumps (Online section vs Onsite section path logic)
function handleVisibilityBranching() {
    const modeValue = document.getElementById("input_mode")?.value || "";
    
    const onlineSection = document.getElementById("section_element_sec_online");
    const onsiteSection = document.getElementById("section_element_sec_onsite");

    if (onlineSection) {
        if (modeValue === "Online") {
            onlineSection.classList.remove("hidden");
            setInputsRequired(onlineSection, true);
        } else {
            onlineSection.classList.add("hidden");
            setInputsRequired(onlineSection, false);
        }
    }

    if (onsiteSection) {
        if (modeValue === "Onsite") {
            onsiteSection.classList.remove("hidden");
            setInputsRequired(onsiteSection, true);
        } else {
            onsiteSection.classList.add("hidden");
            setInputsRequired(onsiteSection, false);
        }
    }
}

function setInputsRequired(parentContainer, statusValue) {
    const inputs = parentContainer.querySelectorAll("input, select, textarea");
    inputs.forEach(input => {
        const sysId = input.name;
        const configuration = controlTower.fields[sysId];
        if (configuration && configuration.is_required === "Yes") {
            input.required = statusValue;
        }
    });
}

// System Notice Wrapper
function showSystemMessage(text, type) {
    const box = document.getElementById("system-alert");
    box.innerText = text;
    box.className = `p-4 rounded-xl mb-6 font-semibold ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`;
    box.classList.remove("hidden");
}

// Handle final registration package submittals straight into data nodes
document.getElementById("mers-dynamic-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const submissionPayload = {
        timestamp: new Date().toISOString()
    };

    // Construct flat structural submission package using exact mapping keys
    for (let [key, value] of formData.entries()) {
        const fieldConfig = controlTower.fields[key];
        // Skip saving hidden section data fields 
        const inputField = document.getElementById(`input_${key}`);
        if (inputField && inputField.offsetParent === null) continue;

        submissionPayload[key] = fieldConfig?.input_type === "number" ? Number(value) : value;
    }

    try {
        const writeEndpoint = `${FIREBASE_BASE_URL}submissions/${currentEventId}.json`;
        const response = await fetch(writeEndpoint, {
            method: "POST", // POST creates safe, sequential push record strings automatically
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
