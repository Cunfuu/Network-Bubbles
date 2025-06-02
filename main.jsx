import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, deleteDoc, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { ArrowLeftRight, Building, Users, PlusCircle, Edit3, Trash2, X, Search, Link as LinkIcon, Globe, Phone, Mail, Briefcase, Image as ImageIcon, Tv, Video, Speaker, Wifi, SignalHigh, SignalMedium, SignalLow, XCircle, Home, Users2, MonitorPlay, Presentation, UploadCloud, DownloadCloud, AlertCircle, Palette, Circle } from 'lucide-react';
import EntityDetailModal from './components/EntityDetailModal';
import InfoItem from './components/InfoItem';
import AmenityItem from './components/AmenityItem';
import CheckboxInput from './components/CheckboxInput';
import InputRow from './components/InputRow';
import { getColorGradeInfo, renderGsmSignalIcon, COLOR_GRADES, DEFAULT_COLOR_GRADE } from './components/utilityFunctions';
import GraphView from './components/GraphView';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "YOUR_API_KEY", 
  authDomain: "YOUR_AUTH_DOMAIN", 
  projectId: "YOUR_PROJECT_ID", 
  storageBucket: "YOUR_STORAGE_BUCKET", 
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", 
  appId: "YOUR_APP_ID" 
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Global App ID ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'network-graph-default-app-id';

// --- Helper Functions ---
// --- CSV Helper Functions ---
function escapeCsvField(field) {
    if (field === null || typeof field === 'undefined') { return ''; }
    let stringField = String(field);
    if (stringField.search(/("|,|\n)/g) >= 0) { stringField = `"${stringField.replace(/"/g, '""')}"`; }
    return stringField;
}

function arrayToCsv(data, columnsConfig) {
    const header = columnsConfig.map(col => escapeCsvField(col.header)).join(',');
    const rows = data.map(item => columnsConfig.map(col => escapeCsvField(col.accessor(item))).join(','));
    return [header, ...rows].join('\n');
}

function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

function parseCsvAdvanced(csvText) {
    const rows = [];
    const lines = csvText.split(/\r\n|\n/);
    if (!lines.length || lines[0].trim() === '') return { headers: [], data: [] };
    
    // Robust header parsing: handles quoted headers with commas
    const headerFields = [];
    let currentHeaderField = '';
    let inHeaderQuotes = false;
    let headerCharPointer = 0;
    while(headerCharPointer < lines[0].length) {
        const char = lines[0][headerCharPointer];
        if (char === '"') {
            if (inHeaderQuotes && headerCharPointer + 1 < lines[0].length && lines[0][headerCharPointer+1] === '"') {
                currentHeaderField += '"'; headerCharPointer++;
            } else { inHeaderQuotes = !inHeaderQuotes; }
        } else if (char === ',' && !inHeaderQuotes) {
            headerFields.push(currentHeaderField.trim());
            currentHeaderField = '';
        } else { currentHeaderField += char; }
        headerCharPointer++;
    }
    headerFields.push(currentHeaderField.trim()); // Add last header field
    const headers = headerFields.map(h => h.replace(/^"|"$/g, '').replace(/""/g, '"'));


    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        const row = {}; let currentField = ''; let inQuotes = false; const fields = []; let charPointer = 0;
        
        function consumeField() { 
            let fieldBuffer = '';
            while(charPointer < lines[i].length) {
                const char = lines[i][charPointer];
                if (char === '"') {
                    if (inQuotes && charPointer + 1 < lines[i].length && lines[i][charPointer+1] === '"') {
                        fieldBuffer += '"'; charPointer++;
                    } else { inQuotes = !inQuotes; }
                } else if (char === ',' && !inQuotes) {
                    charPointer++; return fieldBuffer;
                } else { fieldBuffer += char; }
                charPointer++;
            }
            return fieldBuffer;
        }
        for(let h_idx = 0; h_idx < headers.length; h_idx++) { 
            const fieldValue = consumeField(); 
            fields.push(fieldValue.replace(/^"|"$/g, '').replace(/""/g, '"')); 
        }
        if (fields.length >= headers.length) { headers.forEach((header, index) => { row[header] = fields[index] ? fields[index].trim() : ''; }); rows.push(row);
        } else { console.warn(`Skipping CSV row ${i+1}: Mismatch in fields. Expected ${headers.length}, got ${fields.length}. Line: ${lines[i]}`); }
    }
    return { headers, data: rows };
}

const getCollectionPath = (collectionName, userId) => {
  return `artifacts/${appId}/public/data/${collectionName}`;
};


// --- Main App Component ---
export default function App() {
  const [currentView, setCurrentView] = useState('dataInput');
  const [people, setPeople] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState({ type: '', text: '' });
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [showPersonModal, setShowPersonModal] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [editingOrg, setEditingOrg] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntity, setSelectedEntity] = useState(null); 

  const displayFeedback = (type, text) => { setFeedbackMessage({ type, text }); setTimeout(() => setFeedbackMessage({ type: '', text: '' }), 5000); };
  
  useEffect(() => { const unsub = onAuthStateChanged(auth, async (user) => { if (user) { setUserId(user.uid); } else { try { if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) { await signInWithCustomToken(auth, __initial_auth_token); } else { await signInAnonymously(auth); }} catch (e) { console.error("Auth error:", e); displayFeedback('error', "Authentication failed."); }} setIsAuthReady(true); }); return () => unsub(); }, []);
  useEffect(() => {
    if (!isAuthReady || !userId) { setIsLoading(false); return; }
    setIsLoading(true);
    const pplPath = getCollectionPath('people', userId); const orgsPath = getCollectionPath('organizations', userId);
    const unsubPpl = onSnapshot(query(collection(db, pplPath)), s => { setPeople(s.docs.map(d => ({ id: d.id, ...d.data() }))); setIsLoading(false); }, e => { console.error(e); displayFeedback('error', "Failed to load people."); setIsLoading(false); });
    const unsubOrgs = onSnapshot(query(collection(db, orgsPath)), s => { setOrganizations(s.docs.map(d => ({ id: d.id, ...d.data() }))); setIsLoading(false); }, e => { console.error(e); displayFeedback('error', "Failed to load orgs."); setIsLoading(false); });
    return () => { unsubPpl(); unsubOrgs(); };
  }, [isAuthReady, userId]);

  const handleAddOrUpdatePerson = async (personData) => {
    if (!userId) { displayFeedback('error', "User not authenticated."); return; }
    setIsProcessing(true);
    const peopleCollectionPath = getCollectionPath('people', userId);
    try {
      const dataToSave = { ...personData, colorGrade: personData.colorGrade || DEFAULT_COLOR_GRADE, organizationMemberships: personData.organizationMemberships || [] };
      if (editingPerson) await setDoc(doc(db, peopleCollectionPath, editingPerson.id), dataToSave);
      else await addDoc(collection(db, peopleCollectionPath), { ...dataToSave, createdAt: new Date().toISOString() });
      setShowPersonModal(false); setEditingPerson(null);
      displayFeedback('success', `Person ${editingPerson ? 'updated' : 'added'}.`);
    } catch (e) { console.error("Err saving person: ", e); displayFeedback('error', "Failed to save person."); }
    setIsProcessing(false);
  };

  const handleAddOrUpdateOrg = async (orgData) => {
    if (!userId) { displayFeedback('error', "User not authenticated."); return; }
    setIsProcessing(true);
    const orgsCollectionPath = getCollectionPath('organizations', userId);
    try {
      const dataToSave = { ...orgData, colorGrade: orgData.colorGrade || DEFAULT_COLOR_GRADE, rooms: (orgData.rooms || []).map(r => ({ ...r, seats: r.seats ? parseInt(r.seats, 10) : 0, hasTV: !!r.hasTV, hasProjector: !!r.hasProjector, hasSpeakers: !!r.hasSpeakers, hasCameras: !!r.hasCameras, hasInternet: !!r.hasInternet })) };
      if (editingOrg) await setDoc(doc(db, orgsCollectionPath, editingOrg.id), dataToSave);
      else await addDoc(collection(db, orgsCollectionPath), { ...dataToSave, createdAt: new Date().toISOString() });
      if (editingOrg && editingOrg.name !== dataToSave.name) await updateOrganizationNameInPeople(editingOrg.id, dataToSave.name);
      setShowOrgModal(false); setEditingOrg(null);
      displayFeedback('success', `Organization ${editingOrg ? 'updated' : 'added'}.`);
    } catch (e) { console.error("Err saving org: ", e); displayFeedback('error', "Failed to save organization."); }
    setIsProcessing(false);
  };
  
  const updateOrganizationNameInPeople = async (orgId, newOrgName) => {
    if (!userId) return;
    const peopleCollectionPath = getCollectionPath('people', userId);
    const peopleSnapshot = await getDocs(query(collection(db, peopleCollectionPath)));
    const batch = writeBatch(db);
    let changesMade = false;
    peopleSnapshot.forEach(personDoc => {
        const person = personDoc.data();
        if (person.organizationMemberships && Array.isArray(person.organizationMemberships)) {
            const updatedMemberships = person.organizationMemberships.map(mem => 
                mem.organizationId === orgId ? { ...mem, organizationName: newOrgName } : mem
            );
            if (JSON.stringify(updatedMemberships) !== JSON.stringify(person.organizationMemberships)) {
                batch.update(doc(db, peopleCollectionPath, personDoc.id), { organizationMemberships: updatedMemberships });
                changesMade = true;
            }
        }
    });
    if (changesMade) {
        try { await batch.commit(); } catch (e) { console.error("Error updating org name in people:", e); displayFeedback('error', "Partial update failed."); }
    }
  };

  const handleDeletePerson = async (personId, personMemberships) => {
    if (!userId) { displayFeedback('error', "Not authenticated."); return; }
    setIsProcessing(true);
    // Consider adding a custom modal confirmation here instead of console.log
    console.log("Attempting to delete person:", personId); 
    const peopleCollectionPath = getCollectionPath('people', userId);
    try {
      await deleteDoc(doc(db, peopleCollectionPath, personId));
      // Simplified: This doesn't remove person from org's member list if orgs store that.
      // await updateOrganizationMembershipsForPerson({ id: personId, organizationMemberships: [] }, personMemberships);
      displayFeedback('success', 'Person deleted.');
    } catch (e) { console.error("Error deleting person:", e); displayFeedback('error', "Failed to delete person."); }
    setIsProcessing(false);
  };

  const handleDeleteOrg = async (orgId) => {
    if (!userId) { displayFeedback('error', "Not authenticated."); return; }
    setIsProcessing(true);
    console.log("Attempting to delete organization:", orgId);
    const orgsCollectionPath = getCollectionPath('organizations', userId);
    try {
      await deleteDoc(doc(db, orgsCollectionPath, orgId));
      await removeOrganizationFromPeople(orgId); // Remove this org from people's memberships
      displayFeedback('success', 'Organization deleted.');
    } catch (e) { console.error("Error deleting organization:", e); displayFeedback('error', "Failed to delete organization."); }
    setIsProcessing(false);
  };

  const removeOrganizationFromPeople = async (orgId) => {
    if (!userId) return;
    const peopleCollectionPath = getCollectionPath('people', userId);
    const peopleSnapshot = await getDocs(query(collection(db, peopleCollectionPath)));
    const batch = writeBatch(db);
    let changesMade = false;
    peopleSnapshot.forEach(personDoc => {
        const person = personDoc.data();
         if (person.organizationMemberships && Array.isArray(person.organizationMemberships)) {
            const updatedMemberships = person.organizationMemberships.filter(mem => mem.organizationId !== orgId);
            if (updatedMemberships.length < person.organizationMemberships.length) {
                batch.update(doc(db, peopleCollectionPath, personDoc.id), { organizationMemberships: updatedMemberships });
                changesMade = true;
            }
        }
    });
    if (changesMade) {
        try { await batch.commit(); } catch (e) { console.error("Error removing org from people:", e); /* Potentially display feedback */ }
    }
  };


  const handleExportPeople = () => {
    setIsProcessing(true);
    const columns = [
        { header: 'First Name', accessor: p => p.name ? p.name.split(' ')[0] : '' },
        { header: 'Middle Name', accessor: p => p.name ? p.name.split(' ').slice(1, -1).join(' ') : '' },
        { header: 'Last Name', accessor: p => p.name ? (p.name.split(' ').length > 1 ? p.name.split(' ').pop() : '') : '' },
        { header: 'Color Grade', accessor: p => p.colorGrade || DEFAULT_COLOR_GRADE },
        { header: 'Organization Name', accessor: p => (p.organizationMemberships && p.organizationMemberships[0]) ? p.organizationMemberships[0].organizationName : '' },
        { header: 'Organization Title', accessor: p => (p.organizationMemberships && p.organizationMemberships[0]) ? p.organizationMemberships[0].titleInOrg : '' },
        { header: 'Photo', accessor: p => p.photoUrl || '' },
        { header: 'Phone 1 - Value', accessor: p => p.phone || '' },
        { header: 'Email 1 - Value', accessor: p => p.email || '' },
    ];
    try {
        const csvString = arrayToCsv(people, columns);
        downloadCsv(csvString, 'people_export.csv');
        displayFeedback('success', 'People exported.');
    } catch (e) { console.error(e); displayFeedback('error', 'Failed to export people.'); }
    setIsProcessing(false);
  };

  const handleImportPeople = async (event) => {
    if (!userId) { displayFeedback('error', "Not authenticated."); return; }
    const file = event.target.files[0]; if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const {data: parsedData} = parseCsvAdvanced(e.target.result);
            if (!parsedData.length) { displayFeedback('error', 'CSV empty/invalid.'); setIsProcessing(false); return; }
            const pplPath = getCollectionPath('people', userId); const batch = writeBatch(db); let importedCount = 0;
            for (const row of parsedData) {
                const name = `${row['First Name'] || ''} ${row['Middle Name'] || ''} ${row['Last Name'] || ''}`.replace(/\s+/g, ' ').trim();
                if (!name) { console.warn("Skip row, missing name:", row); continue; }
                const personData = { name, photoUrl: row['Photo'] || '', email: row['Email 1 - Value'] || '', phone: row['Phone 1 - Value'] || '', overallTitle: row['Organization Title'] || '', colorGrade: row['Color Grade'] || DEFAULT_COLOR_GRADE, organizationMemberships: [], createdAt: new Date().toISOString() };
                const orgNameCsv = row['Organization Name'];
                if (orgNameCsv) {
                    const existingOrg = organizations.find(org => org.name.toLowerCase() === orgNameCsv.toLowerCase());
                    personData.organizationMemberships.push({ organizationId: existingOrg ? existingOrg.id : '', organizationName: existingOrg ? existingOrg.name : orgNameCsv, titleInOrg: row['Organization Title'] || '' });
                    if (!existingOrg) console.warn(`Org "${orgNameCsv}" not found for "${name}".`);
                }
                batch.set(doc(collection(db, pplPath)), personData); importedCount++;
            }
            if (importedCount > 0) { await batch.commit(); displayFeedback('success', `${importedCount} people imported.`); }
            else { displayFeedback('info', 'No new people imported.'); }
        } catch (err) { console.error(err); displayFeedback('error', `Import failed: ${err.message}`); }
        finally { setIsProcessing(false); event.target.value = null; }
    };
    reader.onerror = () => { displayFeedback('error', 'Failed to read file.'); setIsProcessing(false); event.target.value = null; };
    reader.readAsText(file);
  };

  const handleExportOrgs = () => {
    setIsProcessing(true);
    const columns = [
        { header: 'ID', accessor: o => o.id }, { header: 'Name', accessor: o => o.name },
        { header: 'Address', accessor: o => o.address || '' }, { header: 'Website', accessor: o => o.website || '' },
        { header: 'Phone', accessor: o => o.phone || '' }, { header: 'Logo URL', accessor: o => o.logoUrl || '' },
        { header: 'Color Grade', accessor: o => o.colorGrade || DEFAULT_COLOR_GRADE },
        { header: 'Rooms Data (JSON)', accessor: o => o.rooms ? JSON.stringify(o.rooms) : '[]' },
    ];
    try {
        const csvString = arrayToCsv(organizations, columns);
        downloadCsv(csvString, 'organizations_export.csv');
        displayFeedback('success', 'Organizations exported.');
    } catch (e) { console.error(e); displayFeedback('error', 'Failed to export orgs.'); }
    setIsProcessing(false);
  };

  const handleImportOrgs = async (event) => {
    if (!userId) { displayFeedback('error', "Not authenticated."); return; }
    const file = event.target.files[0]; if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const {data: parsedData} = parseCsvAdvanced(e.target.result);
            if (!parsedData.length) { displayFeedback('error', 'CSV empty/invalid.'); setIsProcessing(false); return; }
            const orgsPath = getCollectionPath('organizations', userId); const batch = writeBatch(db); let importedCount = 0;
            for (const row of parsedData) {
                if (!row['Name']) { console.warn("Skip org row, missing name:", row); continue; }
                let roomsData = []; try { if (row['Rooms Data (JSON)']) { roomsData = JSON.parse(row['Rooms Data (JSON)']); if (!Array.isArray(roomsData)) roomsData = []; roomsData = roomsData.map(r => ({ name: r.name || '', type: r.type || 'Meeting Room', seats: r.seats ? parseInt(r.seats, 10) : 0, hasTV: !!r.hasTV, hasProjector: !!r.hasProjector, hasSpeakers: !!r.hasSpeakers, hasCameras: !!r.hasCameras, hasInternet: !!r.hasInternet, gsmSignal: r.gsmSignal || 'Good' }));}} catch (jsonErr) { console.warn(`Could not parse Rooms for "${row['Name']}"`); roomsData = []; }
                const orgData = { name: row['Name'], address: row['Address'] || '', website: row['Website'] || '', phone: row['Phone'] || '', logoUrl: row['Logo URL'] || '', colorGrade: row['Color Grade'] || DEFAULT_COLOR_GRADE, rooms: roomsData, createdAt: new Date().toISOString() };
                batch.set(doc(collection(db, orgsPath)), orgData); importedCount++;
            }
            if (importedCount > 0) { await batch.commit(); displayFeedback('success', `${importedCount} orgs imported.`); }
            else { displayFeedback('info', 'No new orgs imported.'); }
        } catch (err) { console.error(err); displayFeedback('error', `Import failed: ${err.message}`); }
        finally { setIsProcessing(false); event.target.value = null; }
    };
    reader.onerror = () => { displayFeedback('error', 'Failed to read file.'); setIsProcessing(false); event.target.value = null; };
    reader.readAsText(file);
  };

  const filteredPeople = people.filter(p => p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredOrgs = organizations.filter(o => o.name && o.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const openPersonModal = (person = null) => { setEditingPerson(person); setShowPersonModal(true); };
  const openOrgModal = (org = null) => { setEditingOrg(org); setShowOrgModal(true); };
  const handleSelectEntity = (entity, type) => { setSelectedEntity({ ...entity, type }); };
  const closeDetailPopup = () => { setSelectedEntity(null); };

  if (!isAuthReady) return <div className="flex justify-center items-center h-screen bg-slate-900 text-white"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div><p className="ml-4">Initializing...</p></div>;
  if (isLoading && isAuthReady && !feedbackMessage.text) return <div className="flex justify-center items-center h-screen bg-slate-900 text-white"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div><p className="ml-4">Loading Data...</p></div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col">
      <header className="bg-slate-800 shadow-lg p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-sky-400">Network Visualizer</h1>
          <div className="flex items-center space-x-2">
            {userId && <span className="text-xs text-slate-400">UID: {userId}</span>}
            <button onClick={() => setCurrentView('dataInput')} className={`px-4 py-2 rounded-lg transition-colors ${currentView === 'dataInput' ? 'bg-sky-500 text-white' : 'bg-slate-700 hover:bg-sky-600'}`}>Data Input</button>
            <button onClick={() => setCurrentView('peopleNetwork')} className={`px-4 py-2 rounded-lg transition-colors ${currentView === 'peopleNetwork' ? 'bg-sky-500 text-white' : 'bg-slate-700 hover:bg-sky-600'}`}>People Network</button>
            <button onClick={() => setCurrentView('orgNetwork')} className={`px-4 py-2 rounded-lg transition-colors ${currentView === 'orgNetwork' ? 'bg-sky-500 text-white' : 'bg-slate-700 hover:bg-sky-600'}`}>Organization Network</button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 flex-grow">
        {feedbackMessage.text && ( <div className={`p-3 rounded-md mb-4 fixed top-20 left-1/2 transform -translate-x-1/2 z-[200] flex items-center shadow-lg ${feedbackMessage.type === 'success' ? 'bg-green-600' : feedbackMessage.type === 'error' ? 'bg-red-600' : 'bg-sky-600'} text-white`}> {feedbackMessage.type === 'success' && <CheckCircle size={20} className="mr-2"/>} {feedbackMessage.type === 'error' && <AlertCircle size={20} className="mr-2"/>} {feedbackMessage.text} <button onClick={() => setFeedbackMessage({type: '', text: ''})} className="ml-4 font-bold text-lg">&times;</button> </div> )}
        {isProcessing && <div className="fixed inset-0 bg-slate-900 bg-opacity-50 flex justify-center items-center z-[300]"><div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sky-400"></div><p className="ml-3 text-sky-300">Processing...</p></div>}
        
        {currentView === 'dataInput' && <DataInputView people={filteredPeople} organizations={filteredOrgs} onAddPerson={() => openPersonModal()} onEditPerson={openPersonModal} onDeletePerson={handleDeletePerson} onAddOrg={() => openOrgModal()} onEditOrg={openOrgModal} onDeleteOrg={handleDeleteOrg} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onSelectEntity={handleSelectEntity} onExportPeople={handleExportPeople} onImportPeople={handleImportPeople} onExportOrgs={handleExportOrgs} onImportOrgs={handleImportOrgs} />}
        {currentView === 'peopleNetwork' && <GraphView key="people-network" type="people" people={people} organizations={organizations} onSelectEntity={handleSelectEntity} />}
        {currentView === 'orgNetwork' && <GraphView key="org-network" type="organizations" people={people} organizations={organizations} onSelectEntity={handleSelectEntity} />}
      </main>

      {showPersonModal && <PersonModal person={editingPerson} organizations={organizations} onClose={() => { setShowPersonModal(false); setEditingPerson(null); }} onSave={handleAddOrUpdatePerson} />}
      {showOrgModal && <OrgModal org={editingOrg} onClose={() => { setShowOrgModal(false); setEditingOrg(null); }} onSave={handleAddOrUpdateOrg} />}
      {selectedEntity && <DetailPopup entity={selectedEntity} onClose={closeDetailPopup} people={people} organizations={organizations} />}

      <footer className="bg-slate-800 text-center p-4 text-sm text-slate-400">Network Visualizer App &copy; 2024</footer>
    </div>
  );
}

// --- DataInputView Component (UPDATED with Tabs) ---
function DataInputView({ people, organizations, onAddPerson, onEditPerson, onDeletePerson, onAddOrg, onEditOrg, onDeleteOrg, searchTerm, setSearchTerm, onSelectEntity, onExportPeople, onImportPeople, onExportOrgs, onImportOrgs }) {
  const [activeTab, setActiveTab] = useState('people'); // 'people' or 'organizations'
  const peopleFileInputRef = React.useRef(null);
  const orgsFileInputRef = React.useRef(null);

  const filteredData = activeTab === 'people' ? people : organizations;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-semibold text-sky-300">Manage Data</h2>
        <div className="relative">
          <input type="text" placeholder={`Search ${activeTab}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 rounded-lg bg-slate-700 border border-slate-600 focus:ring-sky-500 focus:border-sky-500 w-64 md:w-72"/>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <nav className="-mb-px flex space-x-4" aria-label="Tabs">
          <button onClick={() => setActiveTab('people')} className={`${activeTab === 'people' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'} whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors flex items-center`}> <Users size={18} className="mr-2"/> People </button>
          <button onClick={() => setActiveTab('organizations')} className={`${activeTab === 'organizations' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'} whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors flex items-center`}> <Building size={18} className="mr-2"/> Organizations </button>
        </nav>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'people' && (
        <section className="p-4 sm:p-6 bg-slate-800 rounded-xl shadow-md">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h3 className="text-2xl font-medium text-sky-400 flex items-center"><Users className="mr-3"/>People List</h3>
            <div className="flex space-x-2 flex-wrap gap-2">
                <button onClick={onExportPeople} className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-3 rounded-lg flex items-center transition-colors text-sm" title="Export People to CSV"><DownloadCloud size={18} className="mr-1.5"/>Export</button>
                <input type="file" accept=".csv" onChange={onImportPeople} ref={peopleFileInputRef} style={{ display: 'none' }} />
                <button onClick={() => peopleFileInputRef.current?.click()} className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-3 rounded-lg flex items-center transition-colors text-sm" title="Import People from CSV"><UploadCloud size={18} className="mr-1.5"/>Import</button>
                <button onClick={onAddPerson} className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-3 rounded-lg flex items-center transition-colors text-sm"><PlusCircle className="mr-1.5 h-5 w-5" /> Add Person</button>
            </div>
          </div>
          {filteredData.length > 0 ? (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{filteredData.map(p => (<EntityCard key={p.id} entity={p} type="person" onEdit={() => onEditPerson(p)} onDelete={() => onDeletePerson(p.id, p.organizationMemberships)} onSelect={() => onSelectEntity(p, 'person')} />))}</div>) : (<p className="text-slate-400 text-center py-4">No people found matching your search, or no people added yet.</p>)}
        </section>
      )}

      {activeTab === 'organizations' && (
        <section className="p-4 sm:p-6 bg-slate-800 rounded-xl shadow-md">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h3 className="text-2xl font-medium text-sky-400 flex items-center"><Building className="mr-3"/>Organization List</h3>
            <div className="flex space-x-2 flex-wrap gap-2">
                <button onClick={onExportOrgs} className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-3 rounded-lg flex items-center transition-colors text-sm" title="Export Organizations to CSV"><DownloadCloud size={18} className="mr-1.5"/>Export</button>
                <input type="file" accept=".csv" onChange={onImportOrgs} ref={orgsFileInputRef} style={{ display: 'none' }} />
                <button onClick={() => orgsFileInputRef.current?.click()} className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-3 rounded-lg flex items-center transition-colors text-sm" title="Import Organizations from CSV"><UploadCloud size={18} className="mr-1.5"/>Import</button>
                <button onClick={onAddOrg} className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-3 rounded-lg flex items-center transition-colors text-sm"><PlusCircle className="mr-1.5 h-5 w-5" /> Add Org</button>
            </div>
          </div>
          {filteredData.length > 0 ? (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{filteredData.map(o => (<EntityCard key={o.id} entity={o} type="organization" onEdit={() => onEditOrg(o)} onDelete={() => onDeleteOrg(o.id)} onSelect={() => onSelectEntity(o, 'organization')} />))}</div>) : (<p className="text-slate-400 text-center py-4">No organizations found matching your search, or no organizations added yet.</p>)}
        </section>
      )}
    </div>
  );
}

// --- EntityCard Component (UPDATED for Color Grade) ---
function EntityCard({ entity, type, onEdit, onDelete, onSelect, people, organizations }) {
    const isPerson = type === 'person';
    const imageUrl = isPerson ? entity.photoUrl : entity.logoUrl;
    const placeholderText = entity.name ? entity.name.substring(0, 1).toUpperCase() : (isPerson ? 'P' : 'O');
    const placeholderImage = `https://placehold.co/64x64/${isPerson ? '718096' : '4A5568'}/E2E8F0?text=${encodeURIComponent(placeholderText)}&font=Inter`;
    const [imgSrc, setImgSrc] = useState(imageUrl || placeholderImage);
    useEffect(() => { setImgSrc(imageUrl || placeholderImage); }, [imageUrl, placeholderImage, entity.name]);
    const handleImageError = () => { setImgSrc(placeholderImage); };
    const gradeInfo = getColorGradeInfo(entity.colorGrade);

    return (
        <div className={`bg-slate-850 rounded-xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out hover:shadow-sky-500/40 hover:scale-[1.03] border-l-4 ${gradeInfo.colorClass}`}>
            <div className="p-5">
                <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden border-2 border-slate-600 group"><img src={imgSrc} alt={entity.name || 'Entity image'} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" onError={handleImageError} /></div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                            <h4 className="text-lg font-semibold text-sky-400 truncate cursor-pointer hover:text-sky-300 transition-colors" onClick={onSelect} title={entity.name}>{entity.name || (isPerson ? "Unnamed Person" : "Unnamed Organization")}</h4>
                            <span className={`w-3 h-3 rounded-full ${gradeInfo.dotClass} ml-2 mt-1.5 flex-shrink-0`} title={`Grade: ${gradeInfo.label}`}></span>
                        </div>
                        {isPerson && <p className="text-sm text-slate-400 truncate" title={entity.overallTitle}>{entity.overallTitle || 'No title specified'}</p>}
                        {!isPerson && <p className="text-sm text-slate-400 truncate" title={entity.website}>{entity.website || 'No website specified'}</p>}
                    </div>
                </div>
                {isPerson && entity.organizationMemberships && entity.organizationMemberships.length > 0 && (
                     <div className="mt-4 pt-3 border-t border-slate-700">
                        <h5 className="text-xs font-semibold text-slate-500 mb-1.5">Affiliations:</h5>
                        <div className="flex flex-wrap gap-1.5">
                            {(entity.organizationMemberships || []).slice(0,3).map(mem => (<span key={mem.organizationId + (mem.organizationName || Math.random())} className="text-xs bg-sky-700/70 text-sky-200 px-2.5 py-1 rounded-full shadow-sm" title={mem.organizationName}>{mem.organizationName ? (mem.organizationName.length > 15 ? mem.organizationName.substring(0,13) + '...' : mem.organizationName) : "N/A"}</span>))}
                            {(entity.organizationMemberships || []).length > 3 && (<span className="text-xs bg-slate-600 text-slate-300 px-2.5 py-1 rounded-full shadow-sm">+{entity.organizationMemberships.length - 3} more</span>)}
                        </div>
                    </div>
                )}
            </div>
            <div className="bg-slate-900/50 px-5 py-3 flex justify-end space-x-3 border-t border-slate-700/50"><button onClick={onEdit} className="text-yellow-400 hover:text-yellow-300 transition-colors p-1.5 rounded-md hover:bg-slate-700/50" title="Edit"><Edit3 size={18}/></button><button onClick={onDelete} className="text-red-500 hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-slate-700/50" title="Delete"><Trash2 size={18}/></button></div>
        </div>
    );
}

// --- PersonModal Component (UPDATED for Color Grade) ---
function PersonModal({ person, organizations, onClose, onSave }) {
  const [formData, setFormData] = useState({ name: person?.name || '', photoUrl: person?.photoUrl || '', email: person?.email || '', phone: person?.phone || '', overallTitle: person?.overallTitle || '', colorGrade: person?.colorGrade || DEFAULT_COLOR_GRADE, organizationMemberships: person?.organizationMemberships || [] });
  const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
  const handleMembershipChange = (index, field, value) => { const newMemberships = (formData.organizationMemberships || []).map((m, i) => i === index ? { ...m, [field]: value } : m); if (field === 'organizationId') { const selectedOrg = organizations.find(org => org.id === value); newMemberships[index].organizationName = selectedOrg ? selectedOrg.name : ''; } setFormData(prev => ({ ...prev, organizationMemberships: newMemberships })); };
  const addMembershipField = () => { setFormData(prev => ({ ...prev, organizationMemberships: [...(prev.organizationMemberships || []), { organizationId: '', organizationName: '', titleInOrg: '' }] })); };
  const removeMembershipField = (index) => { const newMemberships = (formData.organizationMemberships || []).filter((_, i) => i !== index); setFormData(prev => ({ ...prev, organizationMemberships: newMemberships })); };
  const handleSubmit = (e) => { e.preventDefault(); const finalMemberships = (formData.organizationMemberships || []).filter(mem => mem.organizationId && mem.organizationName ); onSave({...formData, organizationMemberships: finalMemberships}); };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-750">
        <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700"><h3 className="text-2xl font-semibold text-sky-400">{person ? 'Edit Person' : 'Add New Person'}</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors"><X size={24}/></button></div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <InputRow label="Full Name" icon={<Users size={18}/>}><input type="text" name="name" value={formData.name} onChange={handleChange} className="form-input" placeholder="e.g., Jane Doe" required /></InputRow>
          <InputRow label="Photo URL" icon={<ImageIcon size={18}/>}><input type="url" name="photoUrl" value={formData.photoUrl} onChange={handleChange} className="form-input" placeholder="https://example.com/photo.jpg" /></InputRow>
          <InputRow label="Email" icon={<Mail size={18}/>}><input type="email" name="email" value={formData.email} onChange={handleChange} className="form-input" placeholder="jane.doe@example.com" /></InputRow>
          <InputRow label="Phone" icon={<Phone size={18}/>}><input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="form-input" placeholder="+1234567890" /></InputRow>
          <InputRow label="Overall Title" icon={<Briefcase size={18}/>}><input type="text" name="overallTitle" value={formData.overallTitle} onChange={handleChange} className="form-input" placeholder="e.g., CEO, Developer" /></InputRow>
          <InputRow label="Color Grade" icon={<Palette size={18}/>}>
            <select name="colorGrade" value={formData.colorGrade} onChange={handleChange} className="form-input">
                {Object.entries(COLOR_GRADES).map(([key, value]) => (
                    <option key={key} value={key}>{value.label}</option>
                ))}
            </select>
          </InputRow>
          <div className="pt-2">
            <h4 className="text-md font-medium text-sky-300 mb-2">Organization Memberships</h4>
            {(formData.organizationMemberships || []).map((mem, index) => (<div key={index} className="p-3 border border-slate-700 rounded-md mb-3 space-y-3 bg-slate-750/70 shadow-sm"><div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-300">Membership #{index + 1}</span><button type="button" onClick={() => removeMembershipField(index)} className="text-red-400 hover:text-red-300 text-xs p-1 rounded hover:bg-red-500/20 transition-colors">Remove</button></div><select name="organizationId" value={mem.organizationId} onChange={(e) => handleMembershipChange(index, 'organizationId', e.target.value)} className="form-input" required><option value="">Select Organization*</option>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select><input type="text" placeholder="Title in this Organization" value={mem.titleInOrg} onChange={(e) => handleMembershipChange(index, 'titleInOrg', e.target.value)} className="form-input"/></div>))}
            <button type="button" onClick={addMembershipField} className="text-sm bg-sky-600 hover:bg-sky-700 text-white py-1.5 px-3 rounded-md flex items-center transition-colors shadow hover:shadow-md"><PlusCircle size={16} className="mr-1.5"/> Add Membership</button>
          </div>
          <div className="flex justify-end space-x-3 pt-6 border-t border-slate-700 mt-6"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 transition-colors font-medium">Cancel</button><button type="submit" className="px-6 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white transition-colors font-semibold shadow hover:shadow-md">{person ? 'Save Changes' : 'Add Person'}</button></div>
        </form>
      </div>
    </div>
  );
}

// --- OrgModal Component (UPDATED for Color Grade) ---
function OrgModal({ org, onClose, onSave }) {
  const [formData, setFormData] = useState({ name: org?.name || '', address: org?.address || '', website: org?.website || '', logoUrl: org?.logoUrl || '', phone: org?.phone || '', colorGrade: org?.colorGrade || DEFAULT_COLOR_GRADE, rooms: org?.rooms || [] });
  const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
  const handleRoomChange = (index, field, value) => { const newRooms = (formData.rooms || []).map((room, i) => { if (i === index) { if (['hasTV', 'hasProjector', 'hasSpeakers', 'hasCameras', 'hasInternet'].includes(field)) { return { ...room, [field]: !room[field] }; } return { ...room, [field]: value }; } return room; }); setFormData(prev => ({ ...prev, rooms: newRooms })); };
  const addRoomField = () => { setFormData(prev => ({ ...prev, rooms: [...(prev.rooms || []), { name: '', type: 'Meeting Room', seats: 0, hasTV: false, hasProjector: false, hasSpeakers: false, hasCameras: false, hasInternet: false, gsmSignal: 'Good' }] })); };
  const removeRoomField = (index) => { const newRooms = (formData.rooms || []).filter((_, i) => i !== index); setFormData(prev => ({ ...prev, rooms: newRooms })); };
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };
  const roomTypes = ["Meeting Room", "Event Saloon", "Office", "Lab", "Studio", "Other"]; const gsmSignalOptions = ["Good", "Fair", "Poor", "None"];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-750">
        <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700"><h3 className="text-2xl font-semibold text-sky-400">{org ? 'Edit Organization' : 'Add New Organization'}</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors"><X size={24}/></button></div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <InputRow label="Organization Name" icon={<Building size={18}/>}><input type="text" name="name" value={formData.name} onChange={handleChange} className="form-input" placeholder="e.g., Acme Corp" required /></InputRow>
          <InputRow label="Address" icon={<Home size={18}/>}><input type="text" name="address" value={formData.address} onChange={handleChange} className="form-input" placeholder="123 Main St, Anytown" /></InputRow>
          <InputRow label="Website" icon={<Globe size={18}/>}><input type="url" name="website" value={formData.website} onChange={handleChange} className="form-input" placeholder="https://acme.corp" /></InputRow>
          <InputRow label="Logo URL" icon={<ImageIcon size={18}/>}><input type="url" name="logoUrl" value={formData.logoUrl} onChange={handleChange} className="form-input" placeholder="https://acme.corp/logo.png" /></InputRow>
          <InputRow label="Phone" icon={<Phone size={18}/>}><input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="form-input" placeholder="+0987654321" /></InputRow>
          <InputRow label="Color Grade" icon={<Palette size={18}/>}>
            <select name="colorGrade" value={formData.colorGrade} onChange={handleChange} className="form-input">
                {Object.entries(COLOR_GRADES).map(([key, value]) => (
                    <option key={key} value={key}>{value.label}</option>
                ))}
            </select>
          </InputRow>
          <div className="pt-4 mt-4 border-t border-slate-700">
            <h4 className="text-xl font-medium text-sky-300 mb-3">Room Inventory / Spaces</h4>
            {(formData.rooms || []).map((room, index) => ( <div key={index} className="p-4 border border-slate-600 rounded-lg mb-4 space-y-3 bg-slate-750/70 shadow-md"> <div className="flex justify-between items-center"><h5 className="text-lg font-semibold text-sky-400">Room #{index + 1}</h5><button type="button" onClick={() => removeRoomField(index)} className="text-red-400 hover:text-red-300 text-xs p-1 rounded hover:bg-red-500/20 transition-colors">Remove Room</button></div> <InputRow label="Room Name/Identifier" icon={<Presentation size={16}/>}><input type="text" value={room.name} onChange={(e) => handleRoomChange(index, 'name', e.target.value)} className="form-input" placeholder="e.g., Conference Hall A" required /></InputRow> <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> <InputRow label="Room Type" icon={<Building size={16}/>}> <select value={room.type} onChange={(e) => handleRoomChange(index, 'type', e.target.value)} className="form-input"> {roomTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)} </select> </InputRow> <InputRow label="Number of Seats" icon={<Users2 size={16}/>}><input type="number" min="0" value={room.seats} onChange={(e) => handleRoomChange(index, 'seats', e.target.value)} className="form-input" placeholder="e.g., 50" /></InputRow> </div> <h6 className="text-sm font-medium text-slate-300 pt-2">Equipment & Amenities:</h6> <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"> <CheckboxInput label="TV" icon={<Tv size={16}/>} checked={!!room.hasTV} onChange={() => handleRoomChange(index, 'hasTV', !room.hasTV)} /> <CheckboxInput label="Projector" icon={<MonitorPlay size={16}/>} checked={!!room.hasProjector} onChange={() => handleRoomChange(index, 'hasProjector', !room.hasProjector)} /> <CheckboxInput label="Speakers" icon={<Speaker size={16}/>} checked={!!room.hasSpeakers} onChange={() => handleRoomChange(index, 'hasSpeakers', !room.hasSpeakers)} /> <CheckboxInput label="Cameras" icon={<Video size={16}/>} checked={!!room.hasCameras} onChange={() => handleRoomChange(index, 'hasCameras', !room.hasCameras)} /> <CheckboxInput label="Fixed Internet" icon={<Wifi size={16}/>} checked={!!room.hasInternet} onChange={() => handleRoomChange(index, 'hasInternet', !room.hasInternet)} /> </div> <InputRow label="GSM Signal Quality" icon={room.gsmSignal === "Good" ? <SignalHigh size={16}/> : room.gsmSignal === "Fair" ? <SignalMedium size={16}/> : room.gsmSignal === "Poor" ? <SignalLow size={16}/> : <XCircle size={16}/>}> <select value={room.gsmSignal} onChange={(e) => handleRoomChange(index, 'gsmSignal', e.target.value)} className="form-input"> {gsmSignalOptions.map(gs => <option key={gs} value={gs}>{gs}</option>)} </select> </InputRow> </div> ))}
            <button type="button" onClick={addRoomField} className="mt-2 text-sm bg-teal-500 hover:bg-teal-600 text-white py-1.5 px-3 rounded-md flex items-center transition-colors shadow hover:shadow-md"><PlusCircle size={16} className="mr-1.5"/> Add Room/Space</button>
          </div>
          <div className="flex justify-end space-x-3 pt-6 border-t border-slate-700 mt-6"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 transition-colors font-medium">Cancel</button><button type="submit" className="px-6 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white transition-colors font-semibold shadow hover:shadow-md">{org ? 'Save Changes' : 'Add Organization'}</button></div>
        </form>
      </div>
    </div>
  );
}


const styles = ` body { font-family: 'Inter', sans-serif; } .form-input { width: 100%; padding: 0.65rem 0.85rem; border-radius: 0.375rem; background-color: #334155; border: 1px solid #4b5563; color: #f1f5f9; transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out; font-size: 0.9rem; } .form-input:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2); } .form-input::placeholder { color: #94a3b8; } .scrollbar-thin { scrollbar-width: thin; scrollbar-color: #475569 #1e293b; } .scrollbar-thin::-webkit-scrollbar { width: 8px; height: 8px; } .scrollbar-thin::-webkit-scrollbar-track { background: #1e293b; border-radius: 10px; } .scrollbar-thin::-webkit-scrollbar-thumb { background-color: #475569; border-radius: 10px; border: 2px solid #1e293b; } .scrollbar-thin::-webkit-scrollbar-thumb:hover { background-color: #64748b; } .form-checkbox { border-radius: 0.25rem; } @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'); `;
if (!document.getElementById('app-global-styles')) { const styleSheet = document.createElement("style"); styleSheet.id = 'app-global-styles'; styleSheet.type = "text/css"; styleSheet.innerText = styles; document.head.appendChild(styleSheet); }
const CheckCircle = (props) => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}> <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path> <polyline points="22 4 12 14.01 9 11.01"></polyline> </svg> );

