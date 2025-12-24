/**
 * Time Tracker - 数据管理模块
 * 负责所有数据的存储、读取、导入、导出
 */

const DataManager = (function() {
    // localStorage 键名前缀
    const PREFIX = 'timetracker_';
    const KEYS = {
        RECORDS: PREFIX + 'records',
        TAGS: PREFIX + 'tags',
        CURRENT_TIMER: PREFIX + 'current_timer',
        REMINDER_SETTINGS: PREFIX + 'reminder_settings'
    };

    // 默认提醒设置
    const DEFAULT_REMINDER_SETTINGS = {
        normalInterval: 90,        // 普通标签提醒间隔（分钟）
        normalMessageMode: 'random', // 'random' 或 'custom'
        normalCustomMessage: '',
        excludedInterval: 30,      // 特殊标签提醒间隔（分钟）
        excludedMessageMode: 'random',
        excludedCustomMessage: ''
    };

    // 默认标签
    const DEFAULT_TAGS = [
        { id: generateUUID(), name: 'work', color: '#7dd3fc' },
        { id: generateUUID(), name: 'learn', color: '#a78bfa' },
        { id: generateUUID(), name: 'rest', color: '#34d399' },
        { id: generateUUID(), name: 'meeting', color: '#fbbf24' },
        { id: generateUUID(), name: 'coding', color: '#fb923c' }
    ];

    // 生成 UUID
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 获取所有记录
    function getRecords() {
        try {
            const data = localStorage.getItem(KEYS.RECORDS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('读取记录失败:', e);
            return [];
        }
    }

    // 保存所有记录
    function saveRecords(records) {
        try {
            localStorage.setItem(KEYS.RECORDS, JSON.stringify(records));
            return true;
        } catch (e) {
            console.error('保存记录失败:', e);
            return false;
        }
    }

    // 添加新记录
    function addRecord(record) {
        const records = getRecords();
        const newRecord = {
            id: generateUUID(),
            description: record.description || '',
            tags: record.tags || [],
            startTime: record.startTime,
            endTime: record.endTime,
            duration: record.duration
        };
        records.push(newRecord);
        saveRecords(records);
        return newRecord;
    }

    // 删除记录
    function deleteRecord(id) {
        const records = getRecords();
        const filtered = records.filter(r => r.id !== id);
        saveRecords(filtered);
    }

    // 更新记录
    function updateRecord(id, updates) {
        const records = getRecords();
        const index = records.findIndex(r => r.id === id);
        if (index !== -1) {
            records[index] = { ...records[index], ...updates };
            // 重新计算时长
            if (updates.startTime || updates.endTime) {
                const start = new Date(records[index].startTime);
                const end = new Date(records[index].endTime);
                records[index].duration = Math.round((end - start) / 1000);
            }
            saveRecords(records);
            return records[index];
        }
        return null;
    }

    // 获取单条记录
    function getRecordById(id) {
        const records = getRecords();
        return records.find(r => r.id === id);
    }

    // 检测时间冲突
    function detectConflicts(recordId, startTime, endTime) {
        const records = getRecords();
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        const conflicts = [];

        records.forEach(record => {
            if (record.id === recordId) return; // 跳过自己
            
            const rStart = new Date(record.startTime).getTime();
            const rEnd = new Date(record.endTime).getTime();

            // 检查是否有重叠
            if (start < rEnd && end > rStart) {
                // 计算重叠时长
                const overlapStart = Math.max(start, rStart);
                const overlapEnd = Math.min(end, rEnd);
                const overlapDuration = Math.round((overlapEnd - overlapStart) / 1000);
                
                conflicts.push({
                    record: record,
                    overlapStart: new Date(overlapStart),
                    overlapEnd: new Date(overlapEnd),
                    overlapDuration: overlapDuration
                });
            }
        });

        return conflicts;
    }

    // 分割记录以移除冲突时间
    function splitRecordToRemoveOverlap(recordId, conflictRecordId) {
        const records = getRecords();
        const record = records.find(r => r.id === recordId);
        const conflictRecord = records.find(r => r.id === conflictRecordId);
        
        if (!record || !conflictRecord) return null;

        const start = new Date(record.startTime).getTime();
        const end = new Date(record.endTime).getTime();
        const cStart = new Date(conflictRecord.startTime).getTime();
        const cEnd = new Date(conflictRecord.endTime).getTime();

        // 移除原记录
        const filtered = records.filter(r => r.id !== recordId);
        const newRecords = [];

        // 情况1: 冲突在中间，需要分割成两段
        if (cStart > start && cEnd < end) {
            // 前半段
            newRecords.push({
                ...record,
                id: generateUUID(),
                endTime: new Date(cStart).toISOString(),
                duration: Math.round((cStart - start) / 1000)
            });
            // 后半段
            newRecords.push({
                ...record,
                id: generateUUID(),
                startTime: new Date(cEnd).toISOString(),
                duration: Math.round((end - cEnd) / 1000)
            });
        }
        // 情况2: 冲突在开始部分
        else if (cStart <= start && cEnd > start && cEnd < end) {
            newRecords.push({
                ...record,
                id: generateUUID(),
                startTime: new Date(cEnd).toISOString(),
                duration: Math.round((end - cEnd) / 1000)
            });
        }
        // 情况3: 冲突在结束部分
        else if (cStart > start && cStart < end && cEnd >= end) {
            newRecords.push({
                ...record,
                id: generateUUID(),
                endTime: new Date(cStart).toISOString(),
                duration: Math.round((cStart - start) / 1000)
            });
        }
        // 情况4: 完全被覆盖，删除整条记录
        // 不添加任何新记录

        // 只保存有效时长的记录
        const validRecords = newRecords.filter(r => r.duration > 0);
        saveRecords([...filtered, ...validRecords]);
        
        return validRecords;
    }

    // 获取所有标签
    function getTags() {
        try {
            const data = localStorage.getItem(KEYS.TAGS);
            if (data) {
                return JSON.parse(data);
            }
            // 首次使用，初始化默认标签
            saveTags(DEFAULT_TAGS);
            return DEFAULT_TAGS;
        } catch (e) {
            console.error('读取标签失败:', e);
            return DEFAULT_TAGS;
        }
    }

    // 保存所有标签
    function saveTags(tags) {
        try {
            localStorage.setItem(KEYS.TAGS, JSON.stringify(tags));
            return true;
        } catch (e) {
            console.error('保存标签失败:', e);
            return false;
        }
    }

    // 添加新标签
    function addTag(name, color, isExcluded = false) {
        const tags = getTags();
        const newTag = {
            id: generateUUID(),
            name: name.trim(),
            color: color,
            isExcluded: isExcluded  // 特殊标签：不计入总时间
        };
        tags.push(newTag);
        saveTags(tags);
        return newTag;
    }

    // 更新标签
    function updateTag(id, updates) {
        const tags = getTags();
        const index = tags.findIndex(t => t.id === id);
        if (index !== -1) {
            tags[index] = { ...tags[index], ...updates };
            saveTags(tags);
            return tags[index];
        }
        return null;
    }

    // 删除标签
    function deleteTag(id) {
        const tags = getTags();
        const filtered = tags.filter(t => t.id !== id);
        saveTags(filtered);
    }

    // 获取标签 by ID
    function getTagById(id) {
        const tags = getTags();
        return tags.find(t => t.id === id);
    }

    // 获取提醒设置
    function getReminderSettings() {
        try {
            const data = localStorage.getItem(KEYS.REMINDER_SETTINGS);
            if (data) {
                return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(data) };
            }
            return { ...DEFAULT_REMINDER_SETTINGS };
        } catch (e) {
            console.error('读取提醒设置失败:', e);
            return { ...DEFAULT_REMINDER_SETTINGS };
        }
    }

    // 保存提醒设置
    function saveReminderSettings(settings) {
        try {
            localStorage.setItem(KEYS.REMINDER_SETTINGS, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('保存提醒设置失败:', e);
            return false;
        }
    }

    // 保存当前计时状态（用于页面刷新恢复）
    function saveCurrentTimer(timerState) {
        try {
            localStorage.setItem(KEYS.CURRENT_TIMER, JSON.stringify(timerState));
        } catch (e) {
            console.error('保存计时状态失败:', e);
        }
    }

    // 获取当前计时状态
    function getCurrentTimer() {
        try {
            const data = localStorage.getItem(KEYS.CURRENT_TIMER);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('读取计时状态失败:', e);
            return null;
        }
    }

    // 清除当前计时状态
    function clearCurrentTimer() {
        localStorage.removeItem(KEYS.CURRENT_TIMER);
    }

    // 按日期范围获取记录
    function getRecordsByDateRange(startDate, endDate) {
        const records = getRecords();
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        return records.filter(record => {
            const recordDate = new Date(record.startTime);
            return recordDate >= start && recordDate <= end;
        });
    }

    // 获取某一天的记录
    function getRecordsByDate(date) {
        const d = new Date(date);
        return getRecordsByDateRange(d, d);
    }

    // 获取某一周的记录（周一到周日）
    function getRecordsByWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整到周一
        const monday = new Date(d.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return getRecordsByDateRange(monday, sunday);
    }

    // 获取某一月的记录
    function getRecordsByMonth(year, month) {
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0); // 该月最后一天
        return getRecordsByDateRange(start, end);
    }

    // 按标签统计时长
    function getStatsByTags(records) {
        const tags = getTags();
        const stats = {};
        let totalDuration = 0;

        // 初始化所有标签的统计
        tags.forEach(tag => {
            stats[tag.id] = {
                tag: tag,
                duration: 0,
                count: 0
            };
        });

        // 统计每个记录
        records.forEach(record => {
            totalDuration += record.duration || 0;
            if (record.tags && record.tags.length > 0) {
                record.tags.forEach(tagId => {
                    if (stats[tagId]) {
                        stats[tagId].duration += record.duration || 0;
                        stats[tagId].count += 1;
                    }
                });
            }
        });

        // 计算百分比
        Object.values(stats).forEach(stat => {
            stat.percent = totalDuration > 0 ? (stat.duration / totalDuration * 100) : 0;
        });

        return {
            byTag: stats,
            total: totalDuration
        };
    }

    // 获取一周内每天的统计
    function getWeekDailyStats(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const dailyStats = [];
        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(monday);
            currentDay.setDate(monday.getDate() + i);
            const dayRecords = getRecordsByDate(currentDay);
            const totalDuration = dayRecords.reduce((sum, r) => sum + (r.duration || 0), 0);
            dailyStats.push({
                date: new Date(currentDay),
                duration: totalDuration,
                records: dayRecords
            });
        }
        return dailyStats;
    }

    // 获取月度每天的统计（用于热力图）
    function getMonthDailyStats(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyStats = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayRecords = getRecordsByDate(date);
            const totalDuration = dayRecords.reduce((sum, r) => sum + (r.duration || 0), 0);
            dailyStats.push({
                date: date,
                day: day,
                duration: totalDuration
            });
        }
        return dailyStats;
    }

    // 导出数据
    function exportData(startDate, endDate) {
        const records = getRecordsByDateRange(startDate, endDate);
        const tags = getTags();

        const exportObj = {
            exportTime: new Date().toISOString(),
            version: '1.0',
            dateRange: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            tags: tags,
            records: records
        };

        return JSON.stringify(exportObj, null, 2);
    }

    // 下载导出文件
    function downloadExport(startDate, endDate) {
        const jsonStr = exportData(startDate, endDate);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const formatDate = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}${month}${day}`;
        };

        const filename = `time-records-${formatDate(startDate)}-to-${formatDate(endDate)}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 解析导入的数据
    function parseImportData(jsonStr) {
        try {
            const data = JSON.parse(jsonStr);
            if (!data.version || !data.records || !data.tags) {
                throw new Error('无效的数据格式');
            }
            return {
                success: true,
                data: data,
                recordCount: data.records.length,
                tagCount: data.tags.length,
                dateRange: data.dateRange
            };
        } catch (e) {
            return {
                success: false,
                error: e.message
            };
        }
    }

    // 导入数据（智能合并）
    function importDataMerge(importData) {
        const existingRecords = getRecords();
        const existingTags = getTags();
        const existingRecordIds = new Set(existingRecords.map(r => r.id));
        
        // 按标签名称建立映射（用于合并同名标签）
        const existingTagsByName = {};
        existingTags.forEach(t => {
            existingTagsByName[t.name.toLowerCase()] = t;
        });

        // 建立导入标签ID到现有标签ID的映射
        const tagIdMapping = {};
        let addedTags = 0;
        
        importData.tags.forEach(importTag => {
            const existingTag = existingTagsByName[importTag.name.toLowerCase()];
            if (existingTag) {
                // 同名标签已存在，使用现有标签的ID
                tagIdMapping[importTag.id] = existingTag.id;
            } else {
                // 新标签，添加到列表
                existingTags.push(importTag);
                existingTagsByName[importTag.name.toLowerCase()] = importTag;
                tagIdMapping[importTag.id] = importTag.id;
                addedTags++;
            }
        });

        // 合并记录（跳过已存在的，并更新标签ID）
        let addedRecords = 0;
        importData.records.forEach(record => {
            if (!existingRecordIds.has(record.id)) {
                // 更新记录中的标签ID为现有标签ID
                const updatedRecord = {
                    ...record,
                    tags: (record.tags || []).map(tagId => tagIdMapping[tagId] || tagId)
                };
                existingRecords.push(updatedRecord);
                addedRecords++;
            }
        });

        saveRecords(existingRecords);
        saveTags(existingTags);

        return {
            addedRecords,
            addedTags
        };
    }

    // 导入数据（覆盖全部）
    function importDataReplace(importData) {
        saveRecords(importData.records);
        saveTags(importData.tags);
        return {
            addedRecords: importData.records.length,
            addedTags: importData.tags.length
        };
    }

    // 清空所有数据
    function clearAllData() {
        localStorage.removeItem(KEYS.RECORDS);
        localStorage.removeItem(KEYS.TAGS);
        localStorage.removeItem(KEYS.CURRENT_TIMER);
    }

    // 格式化时长显示
    function formatDuration(seconds) {
        if (!seconds || seconds < 0) return '0m';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    // 格式化时长为 HH:MM:SS
    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
    }

    // 格式化日期
    function formatDate(date, format = 'full') {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const day = d.getDate();
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekday = weekdays[d.getDay()];

        switch (format) {
            case 'full':
                return `${year}年${month}月${day}日 周${weekday}`;
            case 'short':
                return `${month}月${day}日`;
            case 'month':
                return `${year}年${month}月`;
            case 'time':
                return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            default:
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }

    // 获取周范围描述
    function getWeekRange(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return `${formatDate(monday, 'short')} - ${formatDate(sunday, 'short')}`;
    }

    // 公开接口
    return {
        generateUUID,
        getRecords,
        saveRecords,
        addRecord,
        deleteRecord,
        updateRecord,
        getRecordById,
        detectConflicts,
        splitRecordToRemoveOverlap,
        getTags,
        saveTags,
        addTag,
        updateTag,
        deleteTag,
        getTagById,
        getReminderSettings,
        saveReminderSettings,
        saveCurrentTimer,
        getCurrentTimer,
        clearCurrentTimer,
        getRecordsByDateRange,
        getRecordsByDate,
        getRecordsByWeek,
        getRecordsByMonth,
        getStatsByTags,
        getWeekDailyStats,
        getMonthDailyStats,
        exportData,
        downloadExport,
        parseImportData,
        importDataMerge,
        importDataReplace,
        clearAllData,
        formatDuration,
        formatTime,
        formatDate,
        getWeekRange
    };
})();

