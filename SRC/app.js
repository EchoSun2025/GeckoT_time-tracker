/**
 * Time Tracker - 核心应用模块
 * 负责 UI 交互、计时器、快捷键等
 */

const App = (function() {
    // 状态
    let state = {
        isTimerRunning: false,
        timerStartTime: null,
        timerInterval: null,
        currentDescription: '',
        selectedTags: [],
        currentDate: new Date(),
        currentWeekDate: new Date(),
        currentMonth: new Date(),
        editingRecordId: null,
        editSelectedTags: [],
        currentConflicts: [],
        // 键盘导航状态
        keyboardSection: 'desc', // 'desc' or 'tags'
        tagFocusIndex: -1,
        // 时间轴缩放
        timelineZoom: 3.0,  // 3.0 = 默认放大3倍 (72px/hour)
        // 标签筛选：用户手动排除的标签ID列表
        manuallyExcludedTags: []
    };

    // DOM 元素缓存
    const elements = {};

    // 初始化
    function init() {
        cacheElements();
        bindEvents();
        initTabs();
        loadTags();
        restoreTimer();
        updateDailyReport();
        updateWeeklyReport();
        updateMonthlyReport();
        initElectron();
        
        // 请求通知权限
        ReminderSystem.requestPermission();
    }

    // 初始化 Electron 相关功能
    function initElectron() {
        if (window.electronAPI) {
            // 监听全局快捷键触发的开始计时
            window.electronAPI.onStartTimer(() => {
                if (!state.isTimerRunning) {
                    openRecordModal();
                }
            });

            // 监听全局快捷键触发的停止计时
            window.electronAPI.onStopTimer(() => {
                if (state.isTimerRunning) {
                    stopTimer();
                }
            });

            // 监听迷你窗口的继续记录请求
            window.electronAPI.onContinueRecord((recordData) => {
                if (!state.isTimerRunning && recordData) {
                    continueFromMini(recordData);
                }
            });
        }
    }

    // 从迷你窗口继续记录
    function continueFromMini(recordData) {
        state.currentDescription = recordData.description || '';
        state.selectedTags = recordData.tags || [];
        state.timerStartTime = new Date();
        state.isTimerRunning = true;

        DataManager.saveCurrentTimer({
            startTime: state.timerStartTime.toISOString(),
            description: state.currentDescription,
            tags: state.selectedTags
        });

        updateTimerBar();
        document.body.classList.add('timing');
        state.timerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();

        // 启动提醒系统
        try {
            ReminderSystem.start(state.selectedTags, DataManager.getTags);
        } catch (e) {
            console.error('[app.js] ReminderSystem.start 错误:', e);
        }
    }

    // 同步计时状态到 Electron 主进程
    function syncTimerToElectron() {
        if (window.electronAPI) {
            const elapsed = state.timerStartTime ? 
                Math.round((new Date() - state.timerStartTime) / 1000) : 0;
            
            // 获取标签颜色信息
            const tags = DataManager.getTags();
            const tagColors = state.selectedTags.map(tagId => {
                const tag = tags.find(t => t.id === tagId);
                return tag ? { name: tag.name, color: tag.color } : null;
            }).filter(t => t !== null);

            // 获取最后一条记录（用于迷你窗口的"继续"功能）
            let lastRecord = null;
            if (!state.isTimerRunning) {
                const records = DataManager.getRecords();
                if (records.length > 0) {
                    const sorted = records.sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
                    const last = sorted[0];
                    lastRecord = {
                        id: last.id,
                        description: last.description,
                        tags: last.tags,
                        endTime: DataManager.formatDate(last.endTime, 'time')
                    };
                }
            }

            window.electronAPI.sendTimerUpdate({
                isRunning: state.isTimerRunning,
                display: DataManager.formatTime(elapsed),
                description: state.currentDescription,
                tags: state.selectedTags,
                tagColors: tagColors,
                lastRecord: lastRecord
            });
        }
    }

    // 缓存 DOM 元素
    function cacheElements() {
        // 计时器栏
        elements.timerBar = document.getElementById('timer-bar');
        elements.timerDisplay = document.getElementById('timer-display');
        elements.timerDescription = document.getElementById('timer-description');
        elements.timerTags = document.getElementById('timer-tags');
        elements.stopTimerBtn = document.getElementById('stop-timer-btn');

        // 按钮
        elements.startBtn = document.getElementById('start-btn');
        elements.exportBtn = document.getElementById('export-btn');
        elements.settingsBtn = document.getElementById('settings-btn');
        elements.miniModeBtn = document.getElementById('mini-mode-btn');

        // 模态框
        elements.recordModal = document.getElementById('record-modal');
        elements.tagModal = document.getElementById('tag-modal');
        elements.settingsModal = document.getElementById('settings-modal');
        elements.exportModal = document.getElementById('export-modal');
        elements.confirmModal = document.getElementById('confirm-modal');
        elements.editModal = document.getElementById('edit-modal');

        // 编辑模态框元素
        elements.editDescription = document.getElementById('edit-description');
        elements.editStartTime = document.getElementById('edit-start-time');
        elements.editEndTime = document.getElementById('edit-end-time');
        elements.editTagSelector = document.getElementById('edit-tag-selector');
        elements.editConflictWarning = document.getElementById('edit-conflict-warning');
        elements.conflictMessage = document.getElementById('conflict-message');
        elements.fixConflictBtn = document.getElementById('fix-conflict-btn');
        elements.closeEditModal = document.getElementById('close-edit-modal');
        elements.cancelEdit = document.getElementById('cancel-edit');
        elements.saveEdit = document.getElementById('save-edit');
        elements.deleteRecordBtn = document.getElementById('delete-record-btn');

        // 记录模态框元素
        elements.taskDescription = document.getElementById('task-description');
        elements.tagSelector = document.getElementById('tag-selector');
        elements.addTagBtn = document.getElementById('add-tag-btn');
        elements.startRecord = document.getElementById('start-record');
        elements.cancelRecord = document.getElementById('cancel-record');
        elements.closeModal = document.getElementById('close-modal');

        // 标签模态框元素
        elements.tagName = document.getElementById('tag-name');
        elements.colorPicker = document.getElementById('color-picker');
        elements.saveTag = document.getElementById('save-tag');
        elements.cancelTag = document.getElementById('cancel-tag');
        elements.closeTagModal = document.getElementById('close-tag-modal');

        // 设置模态框元素
        elements.closeSettings = document.getElementById('close-settings');
        elements.tagsList = document.getElementById('tags-list');
        elements.addTagSettings = document.getElementById('add-tag-settings');
        elements.importArea = document.getElementById('import-area');
        elements.importFile = document.getElementById('import-file');
        elements.importPreview = document.getElementById('import-preview');
        elements.clearAllData = document.getElementById('clear-all-data');

        // 导出模态框元素
        elements.closeExport = document.getElementById('close-export');
        elements.exportStartDate = document.getElementById('export-start-date');
        elements.exportEndDate = document.getElementById('export-end-date');
        elements.exportPreview = document.getElementById('export-preview');
        elements.confirmExport = document.getElementById('confirm-export');
        elements.cancelExport = document.getElementById('cancel-export');

        // 确认模态框
        elements.confirmTitle = document.getElementById('confirm-title');
        elements.confirmMessage = document.getElementById('confirm-message');
        elements.confirmOk = document.getElementById('confirm-ok');
        elements.confirmCancel = document.getElementById('confirm-cancel');

        // 报表元素
        elements.dailyReport = document.getElementById('daily-report');
        elements.weeklyReport = document.getElementById('weekly-report');
        elements.monthlyReport = document.getElementById('monthly-report');
        elements.currentDate = document.getElementById('current-date');
        elements.currentWeek = document.getElementById('current-week');
        elements.currentMonth = document.getElementById('current-month');
        elements.dailyTotal = document.getElementById('daily-total');
        elements.weeklyTotal = document.getElementById('weekly-total');
        elements.weeklyAvg = document.getElementById('weekly-avg');
        elements.monthlyTotal = document.getElementById('monthly-total');
        elements.dailyTagStats = document.getElementById('daily-tag-stats');
        elements.weeklyTagStats = document.getElementById('weekly-tag-stats');
        elements.monthlyTagStats = document.getElementById('monthly-tag-stats');
        elements.timelineList = document.getElementById('timeline-list');
        elements.calendarHeatmap = document.getElementById('calendar-heatmap');

        // Toast
        elements.toast = document.getElementById('toast');
    }

    // 绑定事件
    function bindEvents() {
        // 快捷键
        document.addEventListener('keydown', handleKeydown);

        // 开始按钮
        elements.startBtn.addEventListener('click', openRecordModal);

        // 停止计时按钮
        elements.stopTimerBtn.addEventListener('click', stopTimer);

        // 记录模态框
        elements.closeModal.addEventListener('click', closeRecordModal);
        elements.cancelRecord.addEventListener('click', closeRecordModal);
        elements.startRecord.addEventListener('click', startTimer);
        elements.addTagBtn.addEventListener('click', openTagModal);
        elements.recordModal.querySelector('.modal-backdrop').addEventListener('click', closeRecordModal);

        // 标签模态框
        elements.closeTagModal.addEventListener('click', closeTagModal);
        elements.cancelTag.addEventListener('click', closeTagModal);
        elements.saveTag.addEventListener('click', saveNewTag);
        elements.tagModal.querySelector('.modal-backdrop').addEventListener('click', closeTagModal);

        // 颜色选择器
        elements.colorPicker.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.colorPicker.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        // 设置模态框
        elements.settingsBtn.addEventListener('click', openSettingsModal);

        // 迷你模式按钮（仅 Electron 环境可用）
        if (elements.miniModeBtn) {
            elements.miniModeBtn.addEventListener('click', () => {
                if (window.electronAPI) {
                    window.electronAPI.toggleMiniMode();
                } else {
                    showToast('迷你模式需要桌面应用版本', 'error');
                }
            });
        }
        elements.closeSettings.addEventListener('click', closeSettingsModal);
        elements.settingsModal.querySelector('.modal-backdrop').addEventListener('click', closeSettingsModal);
        elements.addTagSettings.addEventListener('click', openTagModal);
        elements.clearAllData.addEventListener('click', confirmClearAllData);

        // 提醒设置
        document.getElementById('save-reminder-settings').addEventListener('click', saveReminderSettings);
        document.getElementById('normal-message-mode').addEventListener('change', (e) => {
            document.getElementById('normal-custom-row').style.display = e.target.value === 'custom' ? 'flex' : 'none';
        });
        document.getElementById('excluded-message-mode').addEventListener('change', (e) => {
            document.getElementById('excluded-custom-row').style.display = e.target.value === 'custom' ? 'flex' : 'none';
        });

        // 导入区域
        elements.importArea.addEventListener('click', () => elements.importFile.click());
        elements.importFile.addEventListener('change', handleFileSelect);
        elements.importArea.addEventListener('dragover', handleDragOver);
        elements.importArea.addEventListener('dragleave', handleDragLeave);
        elements.importArea.addEventListener('drop', handleDrop);

        // 导出模态框
        elements.exportBtn.addEventListener('click', openExportModal);
        elements.closeExport.addEventListener('click', closeExportModal);
        elements.cancelExport.addEventListener('click', closeExportModal);
        elements.confirmExport.addEventListener('click', doExport);
        elements.exportModal.querySelector('.modal-backdrop').addEventListener('click', closeExportModal);

        // 导出日期变化
        elements.exportStartDate.addEventListener('change', updateExportPreview);
        elements.exportEndDate.addEventListener('change', updateExportPreview);

        // 快捷选项
        document.querySelectorAll('.quick-options .btn-outline').forEach(btn => {
            btn.addEventListener('click', () => {
                const range = btn.dataset.range;
                setExportDateRange(range);
            });
        });

        // 确认模态框
        elements.confirmCancel.addEventListener('click', closeConfirmModal);
        elements.confirmModal.querySelector('.modal-backdrop').addEventListener('click', closeConfirmModal);

        // 编辑模态框
        elements.closeEditModal.addEventListener('click', closeEditModal);
        elements.cancelEdit.addEventListener('click', closeEditModal);
        elements.saveEdit.addEventListener('click', saveEditedRecord);
        elements.deleteRecordBtn.addEventListener('click', deleteCurrentRecord);
        elements.editModal.querySelector('.modal-backdrop').addEventListener('click', closeEditModal);
        
        // 日期选择器 - 选择后自动保存（不需要按 Enter）
        elements.editStartTime.addEventListener('change', checkEditConflicts);
        elements.editEndTime.addEventListener('change', checkEditConflicts);
        elements.editStartTime.addEventListener('blur', checkEditConflicts);
        elements.editEndTime.addEventListener('blur', checkEditConflicts);
        // 监听输入事件，实时更新
        elements.editStartTime.addEventListener('input', checkEditConflicts);
        elements.editEndTime.addEventListener('input', checkEditConflicts);
        
        elements.fixConflictBtn.addEventListener('click', fixCurrentConflict);

        // 日期导航
        document.getElementById('prev-day').addEventListener('click', () => navigateDate('day', -1));
        document.getElementById('next-day').addEventListener('click', () => navigateDate('day', 1));
        document.getElementById('prev-week').addEventListener('click', () => navigateDate('week', -1));
        document.getElementById('next-week').addEventListener('click', () => navigateDate('week', 1));
        document.getElementById('prev-month').addEventListener('click', () => navigateDate('month', -1));
        document.getElementById('next-month').addEventListener('click', () => navigateDate('month', 1));

        // 标签页切换
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // 时间轴/时间线视图切换
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.view).classList.add('active');
                // 切换视图时重置缩放
                state.timelineZoom = 1.0;
            });
        });

        // 时间轴缩放（Alt + 滚轮）
        const timelineView = document.getElementById('timeline-view');
        if (timelineView) {
            timelineView.addEventListener('wheel', (e) => {
                if (e.altKey) {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    state.timelineZoom = Math.max(0.5, Math.min(3.0, state.timelineZoom + delta));
                    // 重新渲染时间轴
                    const records = DataManager.getRecordsByDate(state.currentDate);
                    renderDayTimelineViewOnly(records);
                }
            }, { passive: false });
        }
    }

    // 快捷键处理
    function handleKeydown(e) {
        // 优先处理模态框键盘导航
        if (!elements.recordModal.classList.contains('hidden')) {
            if (handleModalKeyboard(e)) {
                return; // 已处理
            }
        }

        // Ctrl+Shift+T: 开始记录
        if (e.ctrlKey && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d2388bd3-4679-4c84-a2db-f01e147c7af1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:handleKeydown:ctrlShiftT',message:'Ctrl+Shift+T pressed',data:{isTimerRunning:state.isTimerRunning},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H7'})}).catch(()=>{});
            // #endregion
            if (!state.isTimerRunning) {
                openRecordModal();
            }
        }
        // Ctrl+Shift+S: 停止计时
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            if (state.isTimerRunning) {
                stopTimer();
            }
        }
        // Ctrl+Enter: 开始计时（在模态框中）/ 停止计时
        if (e.ctrlKey && e.key === 'Enter') {
            if (!elements.recordModal.classList.contains('hidden')) {
                e.preventDefault();
                startTimer();
            } else if (state.isTimerRunning) {
                e.preventDefault();
                stopTimer();
            }
        }
        // Enter 在描述输入框中，开始计时
        if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
            if (!elements.recordModal.classList.contains('hidden') && 
                document.activeElement === elements.taskDescription) {
                e.preventDefault();
                startTimer();
            }
        }
        // Escape: 关闭模态框
        if (e.key === 'Escape') {
            closeAllModals();
        }
    }

    // 标签页切换
    function initTabs() {
        switchTab('daily');
    }

    function switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.report').forEach(r => r.classList.remove('active'));
        
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-report`).classList.add('active');
    }

    // 加载标签到选择器
    function loadTags() {
        const tags = DataManager.getTags();
        elements.tagSelector.innerHTML = tags.map(tag => `
            <span class="tag-option${tag.isExcluded ? ' excluded' : ''}" data-id="${tag.id}" style="background: ${tag.color}; color: ${getContrastColor(tag.color)}" title="${tag.isExcluded ? '特殊标签（不计入总时间）' : ''}">
                ${tag.isExcluded ? '🎮 ' : ''}${tag.name}
            </span>
        `).join('');

        // 绑定点击事件
        elements.tagSelector.querySelectorAll('.tag-option').forEach(option => {
            option.addEventListener('click', () => {
                option.classList.toggle('selected');
                updateSelectedTags();
            });
        });

        // 更新设置中的标签列表
        updateTagsList();
    }

    // 更新已选标签
    function updateSelectedTags() {
        state.selectedTags = Array.from(elements.tagSelector.querySelectorAll('.tag-option.selected'))
            .map(el => el.dataset.id);
    }

    // 更新设置中的标签列表
    function updateTagsList() {
        const tags = DataManager.getTags();
        elements.tagsList.innerHTML = tags.map(tag => `
            <div class="tag-list-item" data-id="${tag.id}">
                <span class="tag-color" style="background: ${tag.color}"></span>
                <span class="tag-name">${tag.name}</span>
                <button class="btn-delete" title="删除">×</button>
            </div>
        `).join('');

        // 绑定删除事件
        elements.tagsList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('.tag-list-item').dataset.id;
                DataManager.deleteTag(id);
                loadTags();
                showToast('标签已删除', 'success');
            });
        });
    }

    // 打开记录模态框
    function openRecordModal() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d2388bd3-4679-4c84-a2db-f01e147c7af1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:openRecordModal:entry',message:'openRecordModal called',data:{isTimerRunning:state.isTimerRunning},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H7'})}).catch(()=>{});
        // #endregion
        elements.recordModal.classList.remove('hidden');
        elements.taskDescription.value = '';
        elements.taskDescription.focus();
        state.selectedTags = [];
        
        // 初始化键盘导航状态
        state.keyboardSection = 'desc';
        state.tagFocusIndex = -1;
        updateKeyboardFocus();
        
        elements.tagSelector.querySelectorAll('.tag-option').forEach(el => el.classList.remove('selected'));
        loadTags();
    }

    // 更新键盘焦点样式
    function updateKeyboardFocus() {
        // 更新区域高亮
        const descSection = document.getElementById('input-section-desc');
        const tagsSection = document.getElementById('input-section-tags');
        
        if (descSection && tagsSection) {
            descSection.classList.toggle('keyboard-active', state.keyboardSection === 'desc');
            tagsSection.classList.toggle('keyboard-active', state.keyboardSection === 'tags');
        }

        // 更新标签焦点
        const tagOptions = elements.tagSelector.querySelectorAll('.tag-option');
        tagOptions.forEach((opt, i) => {
            opt.classList.toggle('keyboard-focus', state.keyboardSection === 'tags' && i === state.tagFocusIndex);
        });
    }

    // 处理模态框键盘导航
    function handleModalKeyboard(e) {
        if (elements.recordModal.classList.contains('hidden')) return false;

        const tagOptions = elements.tagSelector.querySelectorAll('.tag-option');
        const tagCount = tagOptions.length;

        switch (e.key) {
            case 'ArrowUp':
                if (state.keyboardSection === 'tags') {
                    state.keyboardSection = 'desc';
                    state.tagFocusIndex = -1;
                    elements.taskDescription.focus();
                    updateKeyboardFocus();
                    e.preventDefault();
                    return true;
                }
                break;

            case 'ArrowDown':
                if (state.keyboardSection === 'desc') {
                    state.keyboardSection = 'tags';
                    state.tagFocusIndex = tagCount > 0 ? 0 : -1;
                    elements.taskDescription.blur();
                    updateKeyboardFocus();
                    e.preventDefault();
                    return true;
                }
                break;

            case 'ArrowLeft':
                if (state.keyboardSection === 'tags' && tagCount > 0) {
                    state.tagFocusIndex = state.tagFocusIndex > 0 ? state.tagFocusIndex - 1 : tagCount - 1;
                    updateKeyboardFocus();
                    e.preventDefault();
                    return true;
                }
                break;

            case 'ArrowRight':
                if (state.keyboardSection === 'tags' && tagCount > 0) {
                    state.tagFocusIndex = state.tagFocusIndex < tagCount - 1 ? state.tagFocusIndex + 1 : 0;
                    updateKeyboardFocus();
                    e.preventDefault();
                    return true;
                }
                break;

            case ' ':
                if (state.keyboardSection === 'tags' && state.tagFocusIndex >= 0) {
                    const focusedTag = tagOptions[state.tagFocusIndex];
                    if (focusedTag) {
                        focusedTag.click();
                    }
                    e.preventDefault();
                    return true;
                }
                break;

            case 'n':
            case 'N':
                if (state.keyboardSection === 'tags' || document.activeElement !== elements.taskDescription) {
                    openTagModal();
                    e.preventDefault();
                    return true;
                }
                break;

            case 'Enter':
                if (!e.ctrlKey && !e.shiftKey && state.keyboardSection !== 'desc') {
                    // 在标签区域按 Enter，开始计时
                    startTimer();
                    e.preventDefault();
                    return true;
                }
                break;
        }
        return false;
    }

    // 关闭记录模态框
    function closeRecordModal() {
        elements.recordModal.classList.add('hidden');
    }

    // 打开标签模态框
    function openTagModal() {
        elements.tagModal.classList.remove('hidden');
        elements.tagName.value = '';
        elements.tagName.focus();
        elements.colorPicker.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
        elements.colorPicker.querySelector('.color-option').classList.add('selected');
        // 重置特殊标签复选框
        const excludedCheckbox = document.getElementById('tag-excluded');
        if (excludedCheckbox) excludedCheckbox.checked = false;
    }

    // 关闭标签模态框
    function closeTagModal() {
        elements.tagModal.classList.add('hidden');
    }

    // 保存新标签
    function saveNewTag() {
        const name = elements.tagName.value.trim();
        const color = elements.colorPicker.querySelector('.color-option.selected').dataset.color;
        const isExcluded = document.getElementById('tag-excluded').checked;
        
        if (!name) {
            showToast('请输入标签名称', 'error');
            return;
        }

        DataManager.addTag(name, color, isExcluded);
        loadTags();
        closeTagModal();
        showToast(isExcluded ? '特殊标签创建成功' : '标签创建成功', 'success');
    }

    // 开始计时
    function startTimer() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d2388bd3-4679-4c84-a2db-f01e147c7af1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:startTimer:entry',message:'startTimer called',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        const description = elements.taskDescription.value.trim();
        updateSelectedTags();

        state.isTimerRunning = true;
        state.timerStartTime = new Date();
        state.currentDescription = description;

        // 保存计时状态
        DataManager.saveCurrentTimer({
            startTime: state.timerStartTime.toISOString(),
            description: description,
            tags: state.selectedTags
        });

        // 更新UI
        updateTimerBar();
        closeRecordModal();
        document.body.classList.add('timing');

        // 开始计时更新
        state.timerInterval = setInterval(updateTimerDisplay, 1000);

        // 启动提醒系统
        try {
            ReminderSystem.start(state.selectedTags, DataManager.getTags);
        } catch (e) {
            console.error('[app.js] ReminderSystem.start 错误:', e);
        }

        showToast('计时开始', 'success');
    }

    // 停止计时
    function stopTimer() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d2388bd3-4679-4c84-a2db-f01e147c7af1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:stopTimer:entry',message:'stopTimer called',data:{isRunning:state.isTimerRunning},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion
        if (!state.isTimerRunning) return;

        const endTime = new Date();
        const duration = Math.round((endTime - state.timerStartTime) / 1000);

        // 保存记录
        DataManager.addRecord({
            description: state.currentDescription,
            tags: state.selectedTags,
            startTime: state.timerStartTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: duration
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d2388bd3-4679-4c84-a2db-f01e147c7af1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:stopTimer:afterSave',message:'Record saved',data:{duration},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion

        // 清除计时状态
        DataManager.clearCurrentTimer();
        clearInterval(state.timerInterval);

        state.isTimerRunning = false;
        state.timerStartTime = null;
        state.currentDescription = '';
        state.selectedTags = [];
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d2388bd3-4679-4c84-a2db-f01e147c7af1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:stopTimer:stateReset',message:'State reset',data:{isRunning:state.isTimerRunning},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H7'})}).catch(()=>{});
        // #endregion

        // 重置提醒系统
        try {
            ReminderSystem.reset();
        } catch(e) {
            console.error('[app.js] ReminderSystem.reset 错误:', e);
        }

        // 更新UI
        elements.timerBar.classList.add('hidden');
        document.body.classList.remove('timing');

        // 同步停止状态到 Electron
        syncTimerToElectron();

        // 刷新报表
        try {
            updateDailyReport();
            updateWeeklyReport();
            updateMonthlyReport();
        } catch(e) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d2388bd3-4679-4c84-a2db-f01e147c7af1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:stopTimer:reportError',message:'Report update error',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H8'})}).catch(()=>{});
            // #endregion
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d2388bd3-4679-4c84-a2db-f01e147c7af1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:stopTimer:complete',message:'stopTimer completed',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion

        showToast(`已记录 ${DataManager.formatDuration(duration)}`, 'success');
    }

    // 更新计时器栏
    function updateTimerBar() {
        elements.timerBar.classList.remove('hidden');
        elements.timerDescription.textContent = state.currentDescription || '(无描述)';
        
        // 显示标签
        const tags = DataManager.getTags();
        elements.timerTags.innerHTML = state.selectedTags.map(tagId => {
            const tag = tags.find(t => t.id === tagId);
            if (tag) {
                return `<span class="tag" style="background: ${tag.color}; color: ${getContrastColor(tag.color)}">${tag.name}</span>`;
            }
            return '';
        }).join('');

        updateTimerDisplay();
    }

    // 更新计时器显示
    function updateTimerDisplay() {
        if (!state.timerStartTime) return;
        const elapsed = Math.round((new Date() - state.timerStartTime) / 1000);
        elements.timerDisplay.textContent = DataManager.formatTime(elapsed);
        
        // 同步到 Electron 主进程（用于迷你窗口和托盘）
        syncTimerToElectron();

        // 每 5 秒更新一次时间线视图中的正在进行记录
        if (elapsed % 5 === 0) {
            updateActiveRecordInView();
        }
    }

    // 更新视图中正在进行的记录
    function updateActiveRecordInView() {
        // 更新时间线列表中的正在进行记录
        const activeItem = document.querySelector('.timeline-item.active-record');
        if (activeItem) {
            const elapsed = Math.round((new Date() - state.timerStartTime) / 1000);
            const durationEl = activeItem.querySelector('.timeline-duration');
            if (durationEl) {
                durationEl.textContent = DataManager.formatDuration(elapsed);
            }
        }
    }

    // 恢复计时状态
    function restoreTimer() {
        const savedTimer = DataManager.getCurrentTimer();
        if (savedTimer) {
            state.isTimerRunning = true;
            state.timerStartTime = new Date(savedTimer.startTime);
            state.currentDescription = savedTimer.description;
            state.selectedTags = savedTimer.tags || [];
            
            updateTimerBar();
            document.body.classList.add('timing');
            state.timerInterval = setInterval(updateTimerDisplay, 1000);

            // 启动提醒系统
            try {
                ReminderSystem.start(state.selectedTags, DataManager.getTags);
            } catch (e) {
                console.error('[app.js] ReminderSystem.start 错误:', e);
            }
        }
    }

    // 日期导航
    function navigateDate(type, delta) {
        switch (type) {
            case 'day':
                state.currentDate.setDate(state.currentDate.getDate() + delta);
                updateDailyReport();
                break;
            case 'week':
                state.currentWeekDate.setDate(state.currentWeekDate.getDate() + delta * 7);
                updateWeeklyReport();
                break;
            case 'month':
                state.currentMonth.setMonth(state.currentMonth.getMonth() + delta);
                updateMonthlyReport();
                break;
        }
    }

    // 更新日报
    function updateDailyReport() {
        elements.currentDate.textContent = DataManager.formatDate(state.currentDate, 'full');
        
        const records = DataManager.getRecordsByDate(state.currentDate);
        
        // 渲染标签筛选器
        renderTagFilter('daily', records);
        
        // 计算筛选后的统计（排除特殊标签和手动排除的标签）
        const filteredStats = getFilteredStats(records);
        
        elements.dailyTotal.textContent = DataManager.formatDuration(filteredStats.total);
        
        // 更新标签统计
        renderTagStats(elements.dailyTagStats, filteredStats);
        
        // 更新时间线
        renderTimeline(records);
    }

    // 渲染标签筛选器
    function renderTagFilter(type, records) {
        const includedContainer = document.getElementById(`${type}-included-tags`);
        const excludedContainer = document.getElementById(`${type}-excluded-tags`);
        
        if (!includedContainer || !excludedContainer) return;

        const tags = DataManager.getTags();
        
        // 找出这些记录中使用的所有标签
        const usedTagIds = new Set();
        records.forEach(record => {
            (record.tags || []).forEach(tagId => usedTagIds.add(tagId));
        });
        
        const usedTags = tags.filter(t => usedTagIds.has(t.id));
        
        // 分为包括和不包括两类
        const includedTags = usedTags.filter(t => !t.isExcluded && !state.manuallyExcludedTags.includes(t.id));
        const excludedTags = usedTags.filter(t => t.isExcluded || state.manuallyExcludedTags.includes(t.id));
        
        // 渲染包括的标签
        includedContainer.innerHTML = includedTags.length > 0 ? includedTags.map(tag => `
            <span class="filter-tag" data-id="${tag.id}" style="background: ${tag.color}; color: ${getContrastColor(tag.color)}" title="点击移到不包括">
                ${tag.name}
                <span class="action-icon"></span>
            </span>
        `).join('') : '<span style="color: var(--text-muted); font-size: 11px;">无</span>';
        
        // 渲染不包括的标签
        excludedContainer.innerHTML = excludedTags.length > 0 ? excludedTags.map(tag => `
            <span class="filter-tag" data-id="${tag.id}" style="background: ${tag.color}; color: ${getContrastColor(tag.color)}" title="点击移到包括">
                ${tag.isExcluded ? '🎮 ' : ''}${tag.name}
                <span class="action-icon"></span>
            </span>
        `).join('') : '<span style="color: var(--text-muted); font-size: 11px;">无</span>';
        
        // 绑定点击事件
        includedContainer.querySelectorAll('.filter-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                const tagId = tag.dataset.id;
                if (!state.manuallyExcludedTags.includes(tagId)) {
                    state.manuallyExcludedTags.push(tagId);
                    refreshCurrentReport();
                }
            });
        });
        
        excludedContainer.querySelectorAll('.filter-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                const tagId = tag.dataset.id;
                const tagData = tags.find(t => t.id === tagId);
                // 只能移动手动排除的，不能移动默认特殊标签
                if (tagData && !tagData.isExcluded) {
                    state.manuallyExcludedTags = state.manuallyExcludedTags.filter(id => id !== tagId);
                    refreshCurrentReport();
                }
            });
        });
    }

    // 获取筛选后的统计数据
    function getFilteredStats(records) {
        const tags = DataManager.getTags();
        
        // 过滤掉特殊标签和手动排除标签的记录时间
        const excludedTagIds = new Set([
            ...tags.filter(t => t.isExcluded).map(t => t.id),
            ...state.manuallyExcludedTags
        ]);
        
        // 计算总时间（排除特殊标签的记录）
        let total = 0;
        const tagStats = {};
        
        records.forEach(record => {
            // 检查记录是否包含任何被排除的标签
            const recordTags = record.tags || [];
            const hasExcludedTag = recordTags.some(tagId => excludedTagIds.has(tagId));
            
            if (!hasExcludedTag) {
                total += record.duration;
            }
            
            // 仍然统计各标签时间（用于显示）
            recordTags.forEach(tagId => {
                if (!tagStats[tagId]) {
                    tagStats[tagId] = { duration: 0 };
                }
                tagStats[tagId].duration += record.duration;
            });
        });
        
        // 构建返回格式
        const byTag = Object.entries(tagStats)
            .filter(([tagId]) => !excludedTagIds.has(tagId))
            .map(([tagId, data]) => {
                const tag = tags.find(t => t.id === tagId);
                return {
                    tag: tag || { name: '未知', color: '#666' },
                    duration: data.duration,
                    percent: total > 0 ? (data.duration / total) * 100 : 0
                };
            })
            .sort((a, b) => b.duration - a.duration);
        
        return { total, byTag };
    }

    // 刷新当前报表
    function refreshCurrentReport() {
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
            const tab = activeTab.dataset.tab;
            switch (tab) {
                case 'daily': updateDailyReport(); break;
                case 'weekly': updateWeeklyReport(); break;
                case 'monthly': updateMonthlyReport(); break;
            }
        }
    }

    // 更新周报
    function updateWeeklyReport() {
        elements.currentWeek.textContent = DataManager.getWeekRange(state.currentWeekDate);
        
        const records = DataManager.getRecordsByWeek(state.currentWeekDate);
        const dailyStats = DataManager.getWeekDailyStats(state.currentWeekDate);
        
        // 渲染标签筛选器
        renderTagFilter('weekly', records);
        
        // 计算筛选后的统计
        const filteredStats = getFilteredStats(records);
        
        elements.weeklyTotal.textContent = DataManager.formatDuration(filteredStats.total);
        
        const daysWithRecords = dailyStats.filter(d => d.duration > 0).length;
        const avgDuration = daysWithRecords > 0 ? Math.round(filteredStats.total / daysWithRecords) : 0;
        elements.weeklyAvg.textContent = DataManager.formatDuration(avgDuration);
        
        // 更新柱状图
        renderWeekChart(dailyStats);
        
        // 更新标签统计
        renderTagStats(elements.weeklyTagStats, filteredStats);
    }

    // 更新月报
    function updateMonthlyReport() {
        elements.currentMonth.textContent = DataManager.formatDate(state.currentMonth, 'month');
        
        const year = state.currentMonth.getFullYear();
        const month = state.currentMonth.getMonth();
        const records = DataManager.getRecordsByMonth(year, month);
        const dailyStats = DataManager.getMonthDailyStats(year, month);
        
        // 渲染标签筛选器
        renderTagFilter('monthly', records);
        
        // 计算筛选后的统计
        const filteredStats = getFilteredStats(records);
        
        elements.monthlyTotal.textContent = DataManager.formatDuration(filteredStats.total);
        
        // 更新日历热力图
        renderCalendarHeatmap(dailyStats, year, month);
        
        // 更新标签统计
        renderTagStats(elements.monthlyTagStats, filteredStats);
    }

    // 渲染标签统计
    function renderTagStats(container, stats) {
        const tagStats = Object.values(stats.byTag)
            .filter(s => s.duration > 0)
            .sort((a, b) => b.duration - a.duration);
        
        if (tagStats.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无数据</div>';
            return;
        }
        
        container.innerHTML = tagStats.map(stat => `
            <div class="tag-stat-item">
                <span class="tag-color" style="background: ${stat.tag.color}"></span>
                <span class="tag-name">${stat.tag.name}</span>
                <div class="tag-bar">
                    <div class="tag-bar-fill" style="width: ${stat.percent}%; background: ${stat.tag.color}"></div>
                </div>
                <span class="tag-duration">${DataManager.formatDuration(stat.duration)}</span>
                <span class="tag-percent">${stat.percent.toFixed(1)}%</span>
            </div>
        `).join('');
    }

    // 渲染时间线
    function renderTimeline(records) {
        const tags = DataManager.getTags();
        
        // 添加正在进行的记录（如果有且是今天）
        let allRecords = [...records];
        let activeRecordId = null;
        
        if (state.isTimerRunning && state.timerStartTime) {
            const timerDate = new Date(state.timerStartTime);
            const viewDate = new Date(state.currentDate);
            
            if (timerDate.toDateString() === viewDate.toDateString()) {
                const elapsed = Math.round((new Date() - state.timerStartTime) / 1000);
                const activeRecord = {
                    id: 'active-record',
                    description: state.currentDescription,
                    tags: state.selectedTags,
                    startTime: state.timerStartTime.toISOString(),
                    endTime: new Date().toISOString(),
                    duration: elapsed,
                    isActive: true
                };
                allRecords.unshift(activeRecord);
                activeRecordId = 'active-record';
            }
        }

        if (allRecords.length === 0) {
            elements.timelineList.innerHTML = '<div class="empty-state">今日暂无记录<br>按 Ctrl+Shift+T 开始记录</div>';
            renderDayTimelineView([]);
            return;
        }
        
        const sorted = [...allRecords].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        // 检测每条记录的冲突
        const conflictMap = {};
        sorted.forEach(record => {
            const conflicts = DataManager.detectConflicts(record.id, record.startTime, record.endTime);
            if (conflicts.length > 0) {
                conflictMap[record.id] = conflicts;
            }
        });
        
        elements.timelineList.innerHTML = sorted.map(record => {
            const startTime = DataManager.formatDate(record.startTime, 'time');
            const endTime = record.isActive ? '进行中' : DataManager.formatDate(record.endTime, 'time');
            const tagHtml = (record.tags || []).map(tagId => {
                const tag = tags.find(t => t.id === tagId);
                if (tag) {
                    return `<span class="tag" style="background: ${tag.color}; color: ${getContrastColor(tag.color)}">${tag.name}</span>`;
                }
                return '';
            }).join('');
            
            // 冲突标记
            const conflicts = conflictMap[record.id];
            let conflictHtml = '';
            if (conflicts && conflicts.length > 0) {
                const totalOverlap = conflicts.reduce((sum, c) => sum + c.overlapDuration, 0);
                const overlapMinutes = Math.round(totalOverlap / 60);
                conflictHtml = `<span class="conflict-indicator"><span class="icon">⚠️</span>${overlapMinutes}min 重叠</span>`;
            }

            // 正在进行的记录标记
            const isActive = record.isActive;
            const activeBadge = isActive ? '<span class="active-badge"><span class="dot"></span>进行中</span>' : '';
            const activeClass = isActive ? ' active-record' : '';
            
            // 正在进行的记录不显示继续和编辑按钮
            const actionButtons = isActive ? '' : `
                <button class="continue-btn" title="继续记录">▶ 继续</button>
                <button class="edit-btn" title="编辑">✎ 编辑</button>
            `;
            
            return `
                <div class="timeline-item${activeClass}" data-record-id="${record.id}">
                    <div class="timeline-time">
                        ${startTime} - ${endTime}${activeBadge}${conflictHtml}
                        <span class="timeline-duration">${DataManager.formatDuration(record.duration)}</span>
                    </div>
                    <div class="timeline-content">
                        <div class="timeline-description">${record.description || '(无描述)'}</div>
                        <div class="timeline-tags">${tagHtml}</div>
                    </div>
                    ${actionButtons}
                </div>
            `;
        }).join('');

        // 绑定编辑按钮事件
        elements.timelineList.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const recordId = e.target.closest('.timeline-item').dataset.recordId;
                openEditModal(recordId);
            });
        });

        // 绑定继续按钮事件
        elements.timelineList.querySelectorAll('.continue-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const recordId = e.target.closest('.timeline-item').dataset.recordId;
                continueRecord(recordId);
            });
        });

        // 渲染 24 小时时间轴视图（传入包含正在进行记录的列表）
        renderDayTimelineView(allRecords);
    }

    // 继续记录功能
    function continueRecord(recordId) {
        const record = DataManager.getRecordById(recordId);
        if (!record) return;

        const recordEndTime = new Date(record.endTime);
        const now = new Date();

        // 检查从记录结束到现在之间是否有其他记录
        const recordsAfter = DataManager.getRecordsByDateRange(recordEndTime, now);
        const hasRecordsInBetween = recordsAfter.some(r => r.id !== recordId);

        if (hasRecordsInBetween) {
            // 有其他记录，另起一个新记录
            state.selectedTags = [...(record.tags || [])];
            state.currentDescription = record.description || '';
            state.isTimerRunning = true;
            state.timerStartTime = now;

            DataManager.saveCurrentTimer({
                startTime: now.toISOString(),
                description: state.currentDescription,
                tags: state.selectedTags
            });

            updateTimerBar();
            document.body.classList.add('timing');
            state.timerInterval = setInterval(updateTimerDisplay, 1000);

            // 启动提醒系统
            try {
                ReminderSystem.start(state.selectedTags, DataManager.getTags);
            } catch (e) {
                console.error('[app.js] ReminderSystem.start 错误:', e);
            }

            showToast('已开始新记录（沿用之前的描述和标签）', 'success');
        } else {
            // 没有其他记录，继续之前的记录（更新结束时间为现在）
            state.selectedTags = [...(record.tags || [])];
            state.currentDescription = record.description || '';
            state.isTimerRunning = true;
            state.timerStartTime = recordEndTime; // 从原记录结束时间开始

            // 删除原记录，开始新的计时（这样停止时会创建完整的记录）
            DataManager.deleteRecord(recordId);

            // 创建新的计时状态，开始时间设为原记录的开始时间
            state.timerStartTime = new Date(record.startTime);

            DataManager.saveCurrentTimer({
                startTime: record.startTime,
                description: state.currentDescription,
                tags: state.selectedTags
            });

            updateTimerBar();
            document.body.classList.add('timing');
            state.timerInterval = setInterval(updateTimerDisplay, 1000);

            // 启动提醒系统
            try {
                ReminderSystem.start(state.selectedTags, DataManager.getTags);
            } catch (e) {
                console.error('[app.js] ReminderSystem.start 错误:', e);
            }
            
            updateDailyReport();
            showToast('继续计时中...', 'success');
        }
    }

    // 渲染 24 小时时间轴视图
    function renderDayTimelineView(records) {
        renderDayTimelineViewOnly(records);
    }

    // 仅渲染时间轴（用于缩放时调用）- AM/PM 双栏版本
    function renderDayTimelineViewOnly(records) {
        const timelineView = document.getElementById('timeline-view');
        
        // 如果没传入 records，获取当前日期的记录
        if (!records) {
            records = DataManager.getRecordsByDate(state.currentDate);
            // 添加正在进行的记录
            if (state.isTimerRunning && state.timerStartTime) {
                const timerDate = new Date(state.timerStartTime);
                const viewDate = new Date(state.currentDate);
                if (timerDate.toDateString() === viewDate.toDateString()) {
                    const elapsed = Math.round((new Date() - state.timerStartTime) / 1000);
                    records.unshift({
                        id: 'active-record',
                        description: state.currentDescription,
                        tags: state.selectedTags,
                        startTime: state.timerStartTime.toISOString(),
                        endTime: new Date().toISOString(),
                        duration: elapsed,
                        isActive: true
                    });
                }
            }
        }

        const baseHourHeight = 24;
        const hourHeight = baseHourHeight * state.timelineZoom; // 应用缩放
        const tags = DataManager.getTags();
        const today = new Date(state.currentDate);
        today.setHours(0, 0, 0, 0);
        
        const dayStart = today.getTime();
        const noonTime = dayStart + 12 * 60 * 60 * 1000;
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;

        // 渲染 AM 栏 (0:00 - 12:00)
        renderTimelineColumn('am', 0, 12, records, hourHeight, dayStart, noonTime, tags, today);
        
        // 渲染 PM 栏 (12:00 - 24:00)
        renderTimelineColumn('pm', 12, 24, records, hourHeight, noonTime, dayEnd, tags, today);
    }

    // 渲染单个时间轴栏
    function renderTimelineColumn(suffix, startHour, endHour, records, hourHeight, columnStart, columnEnd, tags, today) {
        const hourLabels = document.getElementById(`hour-labels-${suffix}`);
        const hourGrid = document.getElementById(`hour-grid-${suffix}`);
        const timeBlocks = document.getElementById(`time-blocks-${suffix}`);
        const container = document.getElementById(`time-blocks-container-${suffix}`);
        
        if (!hourLabels || !hourGrid || !timeBlocks || !container) return;

        const hoursInColumn = endHour - startHour;
        const containerHeight = hoursInColumn * hourHeight;
        
        // 设置容器高度
        container.style.height = `${containerHeight}px`;

        // 生成小时标签
        let labelsHtml = '';
        for (let h = startHour; h < endHour; h++) {
            labelsHtml += `<div class="hour-label" style="height: ${hourHeight}px; font-size: ${Math.min(14, 10 + state.timelineZoom * 2)}px">${String(h).padStart(2, '0')}:00</div>`;
        }
        hourLabels.innerHTML = labelsHtml;

        // 生成小时网格线
        let gridHtml = '';
        for (let h = 0; h <= hoursInColumn; h++) {
            const isMajor = (startHour + h) % 3 === 0;
            gridHtml += `<div class="hour-grid-line${isMajor ? ' major' : ''}" style="top: ${h * hourHeight}px"></div>`;
        }
        hourGrid.innerHTML = gridHtml;

        // 过滤并处理该栏时间范围内的记录
        const columnRecords = records.map(record => {
            const start = new Date(record.startTime).getTime();
            const end = new Date(record.endTime).getTime();
            
            // 裁剪到该栏的时间范围
            const clippedStart = Math.max(start, columnStart);
            const clippedEnd = Math.min(end, columnEnd);
            
            if (clippedEnd <= clippedStart) return null;
            
            return {
                ...record,
                clippedStart,
                clippedEnd
            };
        }).filter(r => r !== null);

        // 检测重叠并分配列
        const sortedRecords = columnRecords.sort((a, b) => a.clippedStart - b.clippedStart);
        
        sortedRecords.forEach(record => {
            const overlapping = sortedRecords.filter(other => {
                if (other === record) return false;
                return !(other.clippedEnd <= record.clippedStart || other.clippedStart >= record.clippedEnd);
            });
            
            const usedColumns = overlapping
                .filter(o => o.column !== undefined)
                .map(o => o.column);
            
            let col = 0;
            while (usedColumns.includes(col)) col++;
            record.column = col;
            record.maxColumn = Math.max(col, ...overlapping.map(o => o.column || 0));
        });

        sortedRecords.forEach(record => {
            const overlapping = sortedRecords.filter(other => {
                return !(other.clippedEnd <= record.clippedStart || other.clippedStart >= record.clippedEnd);
            });
            record.totalColumnsInSlot = overlapping.length;
        });

        // 字体大小根据缩放调整
        const fontSize = Math.min(14, 10 + state.timelineZoom * 1.5);
        const descFontSize = Math.min(12, 9 + state.timelineZoom);

        // 生成时间块
        let blocksHtml = '';
        sortedRecords.forEach(record => {
            const startMinutes = (record.clippedStart - columnStart) / (60 * 1000);
            const endMinutes = (record.clippedEnd - columnStart) / (60 * 1000);
            const top = (startMinutes / 60) * hourHeight;
            const minHeight = state.timelineZoom >= 2 ? 28 : 20;
            const height = Math.max(((endMinutes - startMinutes) / 60) * hourHeight, minHeight);
            
            const startTime = DataManager.formatDate(record.startTime, 'time');
            const endTime = record.isActive ? '进行中' : DataManager.formatDate(record.endTime, 'time');

            let bgColor = 'rgba(125, 211, 252, 0.3)';
            let borderColor = '#7dd3fc';
            let tagName = '';
            if (record.tags && record.tags.length > 0) {
                const firstTag = tags.find(t => t.id === record.tags[0]);
                if (firstTag) {
                    borderColor = firstTag.color;
                    bgColor = firstTag.color + '40';
                    tagName = firstTag.name;
                }
            }

            const totalCols = record.totalColumnsInSlot;
            const colWidth = 100 / totalCols;
            const left = record.column * colWidth;
            const width = colWidth - 1;

            // 正在进行的记录特殊样式
            const activeClass = record.isActive ? ' active-record' : '';
            const activeLabel = record.isActive ? ' (进行中)' : '';

            // 根据高度和缩放决定显示内容
            const showTag = height > 30 && tagName;
            const showDesc = height > 50 && record.description;

            blocksHtml += `
                <div class="time-block ${totalCols > 1 ? 'overlapping' : ''}${activeClass}" 
                     data-record-id="${record.id}"
                     style="top: ${top}px; height: ${height}px; left: ${left}%; width: ${width}%; background: ${bgColor}; border-color: ${borderColor}; font-size: ${fontSize}px;"
                     title="${startTime} - ${endTime}\n${record.description || '(无描述)'}${activeLabel}">
                    <div class="block-time" style="font-size: ${fontSize}px">${startTime}${record.isActive ? ' ●' : ''}</div>
                    ${showTag ? `<div class="block-tag" style="font-size: ${descFontSize}px">${tagName}</div>` : ''}
                    ${showDesc ? `<div class="block-desc" style="font-size: ${descFontSize}px">${record.description}</div>` : ''}
                </div>
            `;
        });

        // 添加当前时间指示线（如果是今天且在该栏时间范围内）
        const now = new Date();
        if (now.toDateString() === today.toDateString()) {
            const nowMs = now.getTime();
            if (nowMs >= columnStart && nowMs < columnEnd) {
                const nowMinutes = (nowMs - columnStart) / (60 * 1000);
                const nowTop = (nowMinutes / 60) * hourHeight;
                blocksHtml += `<div class="current-time-line" style="top: ${nowTop}px"></div>`;
            }
        }

        timeBlocks.innerHTML = blocksHtml;

        // 绑定点击事件
        timeBlocks.querySelectorAll('.time-block').forEach(block => {
            block.addEventListener('click', () => {
                const recordId = block.dataset.recordId;
                if (recordId !== 'active-record') {
                    openEditModal(recordId);
                }
            });
        });
    }

    // 渲染周柱状图
    function renderWeekChart(dailyStats) {
        const maxDuration = Math.max(...dailyStats.map(d => d.duration), 1);
        
        document.querySelectorAll('.bar-container').forEach((container, index) => {
            const stat = dailyStats[index];
            const bar = container.querySelector('.bar');
            const percent = (stat.duration / maxDuration) * 100;
            bar.style.height = `${percent}%`;
            bar.title = `${DataManager.formatDate(stat.date, 'short')}: ${DataManager.formatDuration(stat.duration)}`;
        });
    }

    // 渲染日历热力图
    function renderCalendarHeatmap(dailyStats, year, month) {
        const firstDay = new Date(year, month, 1);
        const startWeekday = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // 周一为第一天
        const today = new Date();
        
        const maxDuration = Math.max(...dailyStats.map(d => d.duration), 1);
        
        let html = `
            <div class="calendar-header">
                <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
            </div>
            <div class="calendar-grid">
        `;
        
        // 填充空白
        for (let i = 0; i < startWeekday; i++) {
            html += '<div class="calendar-day empty"></div>';
        }
        
        // 填充日期
        dailyStats.forEach(stat => {
            const level = stat.duration === 0 ? 0 : Math.ceil((stat.duration / maxDuration) * 4);
            const isToday = stat.date.toDateString() === today.toDateString();
            html += `
                <div class="calendar-day level-${level}${isToday ? ' today' : ''}" 
                     title="${DataManager.formatDate(stat.date, 'short')}: ${DataManager.formatDuration(stat.duration)}">
                    ${stat.day}
                </div>
            `;
        });
        
        html += '</div>';
        elements.calendarHeatmap.innerHTML = html;
    }

    // 打开设置模态框
    function openSettingsModal() {
        elements.settingsModal.classList.remove('hidden');
        updateTagsList();
        loadReminderSettings();
    }

    // 加载提醒设置
    function loadReminderSettings() {
        const settings = DataManager.getReminderSettings();
        
        document.getElementById('normal-interval').value = settings.normalInterval;
        document.getElementById('normal-message-mode').value = settings.normalMessageMode;
        document.getElementById('normal-custom-message').value = settings.normalCustomMessage || '';
        document.getElementById('normal-custom-row').style.display = settings.normalMessageMode === 'custom' ? 'flex' : 'none';
        
        document.getElementById('excluded-interval').value = settings.excludedInterval;
        document.getElementById('excluded-message-mode').value = settings.excludedMessageMode;
        document.getElementById('excluded-custom-message').value = settings.excludedCustomMessage || '';
        document.getElementById('excluded-custom-row').style.display = settings.excludedMessageMode === 'custom' ? 'flex' : 'none';
    }

    // 保存提醒设置
    function saveReminderSettings() {
        const settings = {
            normalInterval: parseInt(document.getElementById('normal-interval').value) || 90,
            normalMessageMode: document.getElementById('normal-message-mode').value,
            normalCustomMessage: document.getElementById('normal-custom-message').value.trim(),
            excludedInterval: parseInt(document.getElementById('excluded-interval').value) || 30,
            excludedMessageMode: document.getElementById('excluded-message-mode').value,
            excludedCustomMessage: document.getElementById('excluded-custom-message').value.trim()
        };
        
        DataManager.saveReminderSettings(settings);
        showToast('提醒设置已保存', 'success');
    }

    // 关闭设置模态框
    function closeSettingsModal() {
        elements.settingsModal.classList.add('hidden');
    }

    // 打开导出模态框
    function openExportModal() {
        elements.exportModal.classList.remove('hidden');
        setExportDateRange('today');
    }

    // 关闭导出模态框
    function closeExportModal() {
        elements.exportModal.classList.add('hidden');
    }

    // 设置导出日期范围
    function setExportDateRange(range) {
        const today = new Date();
        let start, end;
        
        switch (range) {
            case 'today':
                start = end = today;
                break;
            case 'week':
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                start = new Date(today.setDate(diff));
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                break;
            case 'month':
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'all':
                const records = DataManager.getRecords();
                if (records.length > 0) {
                    const dates = records.map(r => new Date(r.startTime));
                    start = new Date(Math.min(...dates));
                    end = new Date(Math.max(...dates));
                } else {
                    start = end = today;
                }
                break;
        }
        
        elements.exportStartDate.value = formatDateForInput(start);
        elements.exportEndDate.value = formatDateForInput(end);
        
        document.querySelectorAll('.quick-options .btn-outline').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === range);
        });
        
        updateExportPreview();
    }

    // 格式化日期为 input[type=date] 格式
    function formatDateForInput(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 更新导出预览
    function updateExportPreview() {
        const startDate = new Date(elements.exportStartDate.value);
        const endDate = new Date(elements.exportEndDate.value);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            elements.exportPreview.innerHTML = '<p>请选择有效的日期范围</p>';
            return;
        }
        
        const records = DataManager.getRecordsByDateRange(startDate, endDate);
        const totalDuration = records.reduce((sum, r) => sum + (r.duration || 0), 0);
        
        elements.exportPreview.innerHTML = `
            <p>📊 共 <strong>${records.length}</strong> 条记录</p>
            <p>⏱ 总时长 <strong>${DataManager.formatDuration(totalDuration)}</strong></p>
        `;
    }

    // 执行导出
    function doExport() {
        const startDate = new Date(elements.exportStartDate.value);
        const endDate = new Date(elements.exportEndDate.value);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            showToast('请选择有效的日期范围', 'error');
            return;
        }
        
        DataManager.downloadExport(startDate, endDate);
        closeExportModal();
        showToast('数据已导出', 'success');
    }

    // 处理文件选择
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            processImportFile(file);
        }
    }

    // 处理拖拽
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        elements.importArea.classList.add('dragover');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        elements.importArea.classList.remove('dragover');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        elements.importArea.classList.remove('dragover');
        
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/json') {
            processImportFile(file);
        } else {
            showToast('请拖入 JSON 文件', 'error');
        }
    }

    // 处理导入文件
    function processImportFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = DataManager.parseImportData(e.target.result);
            if (result.success) {
                showImportPreview(result);
            } else {
                showToast('文件解析失败: ' + result.error, 'error');
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    // 显示导入预览
    function showImportPreview(result) {
        const data = result.data;
        elements.importPreview.classList.remove('hidden');
        elements.importPreview.innerHTML = `
            <h4>导入预览</h4>
            <p>📊 ${result.recordCount} 条记录</p>
            <p>🏷 ${result.tagCount} 个标签</p>
            ${data.dateRange ? `<p>📅 ${DataManager.formatDate(data.dateRange.start, 'short')} - ${DataManager.formatDate(data.dateRange.end, 'short')}</p>` : ''}
            <div class="import-actions">
                <button class="btn btn-primary" id="import-merge">智能合并</button>
                <button class="btn btn-secondary" id="import-replace">覆盖全部</button>
            </div>
        `;
        
        document.getElementById('import-merge').addEventListener('click', () => {
            const importResult = DataManager.importDataMerge(data);
            showToast(`已导入 ${importResult.addedRecords} 条记录, ${importResult.addedTags} 个标签`, 'success');
            elements.importPreview.classList.add('hidden');
            loadTags();
            updateDailyReport();
            updateWeeklyReport();
            updateMonthlyReport();
        });
        
        document.getElementById('import-replace').addEventListener('click', () => {
            if (confirm('确定要覆盖所有现有数据吗？此操作不可撤销。')) {
                const importResult = DataManager.importDataReplace(data);
                showToast(`已导入 ${importResult.addedRecords} 条记录, ${importResult.addedTags} 个标签`, 'success');
                elements.importPreview.classList.add('hidden');
                loadTags();
                updateDailyReport();
                updateWeeklyReport();
                updateMonthlyReport();
            }
        });
    }

    // 确认清空所有数据
    function confirmClearAllData() {
        showConfirm('清空所有数据', '确定要清空所有时间记录和标签吗？此操作不可撤销。', () => {
            DataManager.clearAllData();
            loadTags();
            updateDailyReport();
            updateWeeklyReport();
            updateMonthlyReport();
            showToast('所有数据已清空', 'success');
        });
    }

    // 显示确认对话框
    function showConfirm(title, message, onConfirm) {
        elements.confirmTitle.textContent = title;
        elements.confirmMessage.textContent = message;
        elements.confirmModal.classList.remove('hidden');
        
        const confirmHandler = () => {
            onConfirm();
            closeConfirmModal();
            elements.confirmOk.removeEventListener('click', confirmHandler);
        };
        
        elements.confirmOk.addEventListener('click', confirmHandler);
    }

    // 关闭确认对话框
    function closeConfirmModal() {
        elements.confirmModal.classList.add('hidden');
    }

    // 打开编辑模态框
    function openEditModal(recordId) {
        const record = DataManager.getRecordById(recordId);
        if (!record) return;

        state.editingRecordId = recordId;
        state.editSelectedTags = [...(record.tags || [])];
        state.currentConflicts = [];

        // 填充表单
        elements.editDescription.value = record.description || '';
        elements.editStartTime.value = formatDateTimeLocal(record.startTime);
        elements.editEndTime.value = formatDateTimeLocal(record.endTime);

        // 加载标签选择器
        loadEditTags();

        // 检查冲突
        checkEditConflicts();

        elements.editModal.classList.remove('hidden');
    }

    // 关闭编辑模态框
    function closeEditModal() {
        elements.editModal.classList.add('hidden');
        state.editingRecordId = null;
        state.editSelectedTags = [];
        state.currentConflicts = [];
    }

    // 加载编辑模态框的标签选择器
    function loadEditTags() {
        const tags = DataManager.getTags();
        elements.editTagSelector.innerHTML = tags.map(tag => {
            const isSelected = state.editSelectedTags.includes(tag.id);
            return `
                <span class="tag-option ${isSelected ? 'selected' : ''}" 
                      data-id="${tag.id}" 
                      style="background: ${tag.color}; color: ${getContrastColor(tag.color)}">
                    ${tag.name}
                </span>
            `;
        }).join('');

        // 绑定点击事件
        elements.editTagSelector.querySelectorAll('.tag-option').forEach(option => {
            option.addEventListener('click', () => {
                option.classList.toggle('selected');
                updateEditSelectedTags();
            });
        });
    }

    // 更新编辑模式的已选标签
    function updateEditSelectedTags() {
        state.editSelectedTags = Array.from(elements.editTagSelector.querySelectorAll('.tag-option.selected'))
            .map(el => el.dataset.id);
    }

    // 格式化为 datetime-local 输入框格式
    function formatDateTimeLocal(isoString) {
        const d = new Date(isoString);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // 检查编辑时的时间冲突
    function checkEditConflicts() {
        const startTime = elements.editStartTime.value;
        const endTime = elements.editEndTime.value;

        if (!startTime || !endTime) {
            elements.editConflictWarning.classList.add('hidden');
            return;
        }

        const conflicts = DataManager.detectConflicts(state.editingRecordId, startTime, endTime);
        state.currentConflicts = conflicts;

        if (conflicts.length > 0) {
            const conflict = conflicts[0];
            const overlapMinutes = Math.round(conflict.overlapDuration / 60);
            elements.conflictMessage.textContent = 
                `与「${conflict.record.description || '(无描述)'}」重叠 ${overlapMinutes} 分钟`;
            elements.editConflictWarning.classList.remove('hidden');
        } else {
            elements.editConflictWarning.classList.add('hidden');
        }
    }

    // 修复当前冲突（减去重叠时间）
    function fixCurrentConflict() {
        if (state.currentConflicts.length === 0) return;

        const conflict = state.currentConflicts[0];
        const result = DataManager.splitRecordToRemoveOverlap(state.editingRecordId, conflict.record.id);

        closeEditModal();
        updateDailyReport();
        updateWeeklyReport();
        updateMonthlyReport();

        if (result && result.length > 0) {
            showToast(`已分割记录，移除 ${Math.round(conflict.overlapDuration / 60)} 分钟重叠`, 'success');
        } else {
            showToast('记录已被完全覆盖，已删除', 'success');
        }
    }

    // 保存编辑的记录
    function saveEditedRecord() {
        const startTime = new Date(elements.editStartTime.value);
        const endTime = new Date(elements.editEndTime.value);

        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
            showToast('请填写有效的时间', 'error');
            return;
        }

        if (endTime <= startTime) {
            showToast('结束时间必须晚于开始时间', 'error');
            return;
        }

        updateEditSelectedTags();

        DataManager.updateRecord(state.editingRecordId, {
            description: elements.editDescription.value.trim(),
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            tags: state.editSelectedTags
        });

        closeEditModal();
        updateDailyReport();
        updateWeeklyReport();
        updateMonthlyReport();
        showToast('记录已更新', 'success');
    }

    // 删除当前编辑的记录
    function deleteCurrentRecord() {
        showConfirm('删除记录', '确定要删除这条时间记录吗？', () => {
            DataManager.deleteRecord(state.editingRecordId);
            closeEditModal();
            updateDailyReport();
            updateWeeklyReport();
            updateMonthlyReport();
            showToast('记录已删除', 'success');
        });
    }

    // 关闭所有模态框
    function closeAllModals() {
        closeRecordModal();
        closeTagModal();
        closeSettingsModal();
        closeExportModal();
        closeConfirmModal();
        closeEditModal();
    }

    // 显示 Toast 消息
    function showToast(message, type = 'success') {
        elements.toast.textContent = message;
        elements.toast.className = `toast ${type}`;
        elements.toast.classList.remove('hidden');
        
        setTimeout(() => {
            elements.toast.classList.add('hidden');
        }, 3000);
    }

    // 获取对比色（用于标签文字）
    function getContrastColor(hexColor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#1a1a24' : '#ffffff';
    }

    // DOM 加载完成后初始化
    document.addEventListener('DOMContentLoaded', init);

    // 公开接口
    return {
        showToast
    };
})();

