// --- App State ---
let quizData = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let currentQuizId = ''; 
let currentShuffledKeys = []; 
let userProgress = JSON.parse(localStorage.getItem('gkgsProgress')) || {};

const SETS_PER_WEEK = 6;

// --- DOM Elements ---
const views = {
    main: document.getElementById('main-menu-view'),
    sub: document.getElementById('sub-menu-view'),
    quiz: document.getElementById('quiz-view'),
    results: document.getElementById('results-view')
};

const weeksGrid = document.getElementById('weeks-grid');
const daysGrid = document.getElementById('days-grid');
const weekTitle = document.getElementById('week-title');

const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const progressText = document.getElementById('progress-text');
const progressBarFill = document.getElementById('progress-bar-fill');

// DOM Elements for Results
const scoreText = document.getElementById('score-text');
const unattemptedText = document.getElementById('unattempted-text');
const retryBtn = document.getElementById('retry-btn');
const nextQuizBtn = document.getElementById('next-quiz-btn');
const resultsToMainBtn = document.getElementById('results-to-main-btn');

// --- Initialization ---
async function initApp() {
    try {
        const response = await fetch('quiz_sets.json');
        quizData = await response.json();
        renderMainMenu();
    } catch (error) {
        console.error("Error loading quiz data:", error);
        weeksGrid.innerHTML = `<p style="color:red;">Failed to load quiz_sets.json. Please ensure you are running this through a local web server (like VS Code Live Server).</p>`;
    }
}

// --- View Navigation ---
function switchView(viewName) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[viewName].classList.add('active');
}

// --- Progress Helpers ---
function saveProgress() {
    localStorage.setItem('gkgsProgress', JSON.stringify(userProgress));
}

function getProgressStats(quizId, totalQuestions) {
    const prog = userProgress[quizId] || { answers: {} };
    const answered = Object.keys(prog.answers).length;
    return {
        answered,
        total: totalQuestions,
        percent: totalQuestions > 0 ? (answered / totalQuestions) * 100 : 0,
        completed: answered === totalQuestions && totalQuestions > 0,
        answers: prog.answers
    };
}

function generateProgressBarHTML(percent, completed) {
    const fillClass = completed ? 'card-progress-fill completed' : 'card-progress-fill';
    return `
        <div class="card-progress-container">
            <div class="${fillClass}" style="width: ${percent}%"></div>
        </div>
    `;
}

// --- Next Quiz Navigation Logic ---
function getNextQuizData() {
    let nextQuizId = '';
    let nextQuestions = [];
    
    if (!quizData || !quizData.metadata) return { nextQuizId, nextQuestions };

    const totalSets = quizData.metadata.total_sets;
    const totalWeeks = Math.ceil(totalSets / SETS_PER_WEEK);

    if (currentQuizId.startsWith('set_')) {
        const currentSetIndex = parseInt(currentQuizId.replace('set_', ''));
        const isLastDayOfWeek = currentSetIndex % SETS_PER_WEEK === 0;
        
        // Check if we are at the very last set of the entire data (even if not a multiple of 6)
        const isVeryLastSet = currentSetIndex === totalSets;

        if (isLastDayOfWeek || isVeryLastSet) {
            // Next up is the revision for this week
            const weekNum = Math.ceil(currentSetIndex / SETS_PER_WEEK);
            nextQuizId = `rev_week_${weekNum}`;
            for (let d = 1; d <= 6; d++) {
                const setId = `set_${(weekNum - 1) * SETS_PER_WEEK + d}`;
                if (quizData.sets[setId]) {
                    nextQuestions = nextQuestions.concat(quizData.sets[setId]);
                }
            }
        } else {
            // Next up is a normal set
            nextQuizId = `set_${currentSetIndex + 1}`;
            if (quizData.sets[nextQuizId]) {
                nextQuestions = quizData.sets[nextQuizId];
            }
        }
    } else if (currentQuizId.startsWith('rev_week_')) {
        // We just finished a revision week
        const currentWeek = parseInt(currentQuizId.replace('rev_week_', ''));
        
        // If it's NOT the final week, queue up the first set of the next week
        if (currentWeek < totalWeeks) {
            nextQuizId = `set_${(currentWeek * SETS_PER_WEEK) + 1}`;
            if (quizData.sets[nextQuizId]) {
                nextQuestions = quizData.sets[nextQuizId];
            }
        }
        // If it IS the final week, nextQuestions remains empty.
    }

    return { nextQuizId, nextQuestions };
}

// --- Main Menu (Weeks) ---
function renderMainMenu() {
    switchView('main');
    weeksGrid.innerHTML = '';
    
    const totalSets = quizData.metadata.total_sets;
    const totalWeeks = Math.ceil(totalSets / SETS_PER_WEEK);
    
    for (let w = 1; w <= totalWeeks; w++) {
        let weekAnswered = 0;
        let weekTotalQuestions = 0;
        
        // Days 1-6
        for(let d = 1; d <= 6; d++) {
            const setIndex = (w - 1) * SETS_PER_WEEK + d;
            const setId = `set_${setIndex}`;
            if (quizData.sets[setId]) {
                const dayTotal = quizData.sets[setId].length;
                weekTotalQuestions += dayTotal;
                weekAnswered += getProgressStats(setId, dayTotal).answered;
            }
        }
        
        // Day 7 Revision stats
        const revId = `rev_week_${w}`;
        const revTotal = weekTotalQuestions; 
        weekTotalQuestions += revTotal;
        weekAnswered += getProgressStats(revId, revTotal).answered;

        const percent = weekTotalQuestions > 0 ? (weekAnswered / weekTotalQuestions) * 100 : 0;
        const completed = weekAnswered === weekTotalQuestions && weekTotalQuestions > 0;

        const card = document.createElement('div');
        card.className = 'menu-card';
        card.innerHTML = `
            <h3>Week ${w}</h3>
            <p style="font-size: 0.8rem; margin-top: 5px;">${weekAnswered} / ${weekTotalQuestions}</p>
            ${generateProgressBarHTML(percent, completed)}
        `;
        card.onclick = () => renderSubMenu(w, totalSets);
        weeksGrid.appendChild(card);
    }
}

// --- Sub Menu (Days) ---
function renderSubMenu(weekNum, totalSets) {
    switchView('sub');
    weekTitle.innerText = `Week ${weekNum}`;
    daysGrid.innerHTML = '';
    
    let revisionQuestions = [];

    // Days 1-6
    for (let d = 1; d <= 6; d++) {
        const setIndex = (weekNum - 1) * SETS_PER_WEEK + d;
        if (setIndex > totalSets) break; 
        
        const setId = `set_${setIndex}`;
        const questions = quizData.sets[setId];
        revisionQuestions = revisionQuestions.concat(questions);
        
        createDayCard(`Day ${d}`, setId, questions, () => startQuiz(setId, questions));
    }
    
    // Day 7 (Revision)
    if (revisionQuestions.length > 0) {
        const revId = `rev_week_${weekNum}`;
        createDayCard('Day 7 (Revision)', revId, revisionQuestions, () => startQuiz(revId, revisionQuestions));
    }
}

function createDayCard(title, quizId, questionsArr, onClickCallback) {
    const totalQ = questionsArr.length;
    const stats = getProgressStats(quizId, totalQ);
    
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.innerHTML = `
        <h3>${title}</h3>
        <p style="font-size: 0.8rem; margin-top: 5px;">${stats.answered} / ${stats.total}</p>
        ${generateProgressBarHTML(stats.percent, stats.completed)}
    `;
    card.onclick = onClickCallback;
    daysGrid.appendChild(card);
}

// --- Quiz Logic ---
function startQuiz(quizId, questionsArr) {
    currentQuizId = quizId;
    currentQuestions = questionsArr;
    currentQuestionIndex = 0;
    
    // Generate a randomized order of options for each question in this session
    currentShuffledKeys = currentQuestions.map(q => {
        const keys = Object.keys(q.options);
        // Fisher-Yates shuffle algorithm
        for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        return keys;
    });
    
    if (!userProgress[currentQuizId]) {
        userProgress[currentQuizId] = { answers: {} };
    }
    
    switchView('quiz');
    updateQuizHeader();
    renderQuestion();
}

function updateQuizHeader() {
    const stats = getProgressStats(currentQuizId, currentQuestions.length);
    progressText.innerText = `${stats.answered} / ${stats.total}`;
    progressBarFill.style.width = `${stats.percent}%`;
    
    if (stats.completed) {
        progressBarFill.classList.add('completed');
    } else {
        progressBarFill.classList.remove('completed');
    }
}

function renderQuestion() {
    const q = currentQuestions[currentQuestionIndex];
    questionText.innerText = `Q${currentQuestionIndex + 1}. ${q.question}`;
    optionsContainer.innerHTML = '';

    const answersState = userProgress[currentQuizId].answers;
    const previouslyAnsweredKey = answersState[currentQuestionIndex];
    const isAnswered = previouslyAnsweredKey !== undefined;

    // Get the randomized keys for the current question
    const displayKeys = currentShuffledKeys[currentQuestionIndex];

    // Render options using the shuffled keys
    displayKeys.forEach((key, index) => {
        const text = q.options[key];
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        
        // Dynamically assign A, B, C, D based on the NEW shuffled position
        const displayLetter = String.fromCharCode(65 + index); 
        btn.innerText = `${displayLetter}. ${text}`;
        
        if (isAnswered) {
            btn.disabled = true;
            if (key === q.answer.key) {
                btn.classList.add('correct');
            } else if (key === previouslyAnsweredKey && key !== q.answer.key) {
                btn.classList.add('wrong');
            }
        } else {
            btn.onclick = () => handleOptionClick(key, q.answer.key);
        }
        
        optionsContainer.appendChild(btn);
    });

    // Button states
    prevBtn.disabled = currentQuestionIndex === 0;
    
    if (currentQuestionIndex === currentQuestions.length - 1) {
        nextBtn.innerText = 'Finish';
        nextBtn.disabled = false;
    } else {
        nextBtn.innerText = 'Next';
        nextBtn.disabled = false;
    }
}

function handleOptionClick(selectedKey, correctKey) {
    userProgress[currentQuizId].answers[currentQuestionIndex] = selectedKey;
    saveProgress();
    updateQuizHeader();
    renderQuestion();
}

// --- Results Logic ---
function renderResults() {
    let correctAnswers = 0;
    let unattempted = 0;
    const answersState = userProgress[currentQuizId].answers;

    // Calculate score and unattempted questions
    currentQuestions.forEach((q, index) => {
        if (answersState[index] === undefined) {
            unattempted++;
        } else if (answersState[index] === q.answer.key) {
            correctAnswers++;
        }
    });

    // Update Results UI
    scoreText.innerText = `${correctAnswers} / ${currentQuestions.length}`;
    unattemptedText.innerText = unattempted;
    
    // Manage visibility of "Next Quiz" button
    const nextInfo = getNextQuizData();
    if (nextInfo.nextQuestions.length > 0) {
        nextQuizBtn.style.display = ''; // Shows button normally
    } else {
        nextQuizBtn.style.display = 'none'; // Hides it on the ultimate final quiz
    }

    switchView('results');
}

// --- Event Listeners ---
document.getElementById('return-to-main').addEventListener('click', renderMainMenu);
document.getElementById('return-to-sub').addEventListener('click', () => {
    let weekNum = 1;
    if (currentQuizId.startsWith('rev_week_')) {
        weekNum = parseInt(currentQuizId.replace('rev_week_', ''));
    } else if (currentQuizId.startsWith('set_')) {
        const setIndex = parseInt(currentQuizId.replace('set_', ''));
        weekNum = Math.ceil(setIndex / SETS_PER_WEEK);
    }
    renderSubMenu(weekNum, quizData.metadata.total_sets);
});

prevBtn.addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion();
    }
});

nextBtn.addEventListener('click', () => {
    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
    } else {
        renderResults();
    }
});

retryBtn.addEventListener('click', () => {
    userProgress[currentQuizId] = { answers: {} };
    saveProgress();
    startQuiz(currentQuizId, currentQuestions);
});

nextQuizBtn.addEventListener('click', () => {
    const nextInfo = getNextQuizData();
    if (nextInfo.nextQuestions.length > 0) {
        startQuiz(nextInfo.nextQuizId, nextInfo.nextQuestions);
    }
});

resultsToMainBtn.addEventListener('click', renderMainMenu);

// Boot the app
window.addEventListener('DOMContentLoaded', initApp);