export const DEFAULT_RULES_YAML = `# Правила подбора источников для генеалогического исследования
# Документация по формату: https://github.com/geneology-code/obsidian-gedcom
#
# Структура:
#   rules:
#     - when: <условие>
#       source: "Название источника"   # необязательно
#       rules: [...]                   # вложенные правила, необязательно
#
# Условия (листовые):
#   always: true                       — всегда (безусловно)
#   place_includes: 'строка'           — любое место содержит подстроку
#   place_includes_any: ['а', 'б']     — любое место содержит хотя бы одну строку
#   birth_place_includes: 'строка'     — только место рождения
#   death_place_includes: 'строка'     — только место смерти
#   born_before: 1900                  — год рождения < значения
#   born_after: 1700                   — год рождения > значения
#   born_between: [1800, 1900]         — год рождения в диапазоне
#   died_before: 1950                  — год смерти < значения
#   died_after: 1800                   — год смерти > значения
#   alive_in: 1858                     — жил в этот год
#   alive_in_range: [1914, 1918]       — жизнь пересекается с периодом
#   sex: M                             — мужского пола (или F)
#   has_dates: true                    — есть хотя бы одна дата
#   has_birth_place: true              — место рождения заполнено
#   occu_include: 'крестьянин'         — профессия (OCCU) содержит подстроку
#   has_occu: true                     — поле OCCU заполнено
#   title_include: 'дворянин'          — титул (TITL) содержит подстроку
#   has_title: true                    — поле TITL заполнено
#   alive_at_in_range: [1800, 1860, 'Россия']  — есть событие с датой в диапазоне И местом содержащим строку
#
# Условия *_include всегда регистронезависимы (оба операнда в нижнем регистре).
#
# Regex-условия (оригинальный регистр данных; управляй через флаги):
#   place_regex: '/паттерн/i'          — любое место совпадает с регуляркой
#   birth_place_regex: '/паттерн/i'    — только место рождения
#   death_place_regex: '/паттерн/i'    — только место смерти
#   occu_regex: '/паттерн/i'           — любое значение OCCU
#   title_regex: '/паттерн/i'          — любое значение TITL
#
#   Формат: /паттерн/флаги  — используй слеши; флаги как в JS
#           /паттерн/       — без флагов = регистрозависимо
#           /паттерн/i      — регистронезависимо
#           паттерн         — без слешей = регистрозависимо (флаги не добавляются)
#   YAML кавычки — все три варианта дают одинаковый результат для простых паттернов:
#     occu_regex: /мещан/i          — без кавычек
#     occu_regex: '/мещан/i'        — одинарные
#     occu_regex: "/мещан/i"        — двойные
#   Кавычки ОБЯЗАТЕЛЬНЫ (одинарные или двойные) если паттерн содержит:
#     ': '  (двоеточие + пробел)  — без кавычек YAML ломается
#     '#'   (хэш)                 — без кавычек всё после # считается комментарием
#   Внимание: \b не работает с кириллицей в JS (кириллица не входит в \w).
#     Для границы слова используй: /(?<!\p{L})мещан(?!\p{L})/u
#
# Комбинаторы:
#   all: [условие, ...]                — все условия (AND)
#   any: [условие, ...]                — хотя бы одно (OR)
#   not: условие                       — отрицание
#
# Логика определения сословия:
#   - title_include: дворянские чины, духовные саны → дворянство / духовенство
#   - occu_include: профессия → купечество / мещанство / казачество / духовенство
#   - По умолчанию (has_occu: false и has_title: false) → крестьянство

rules:
  - when:
      place_includes_any: ['Россия', 'Российская', 'РСФСР', 'Russia', 'USSR', 'Soviet']
    rules:
      - when:
          alive_in_range: [862, 1917]
        rules:

          # =====================================================================
          # ОБЩИЕ ДОКУМЕНТЫ
          # =====================================================================
          - when:
              alive_in_range: [1722, 1917]
            source: "Метрические книги"
          - when:
              alive_in_range: [1737, 1917]
            source: "Исповедные ведомости"
          - when:
              alive_in_range: [1722, 1917]
            source: "Брачные обыски"
          - when:
              alive_in: 1897
            source: "Материалы Первой всеобщей переписи населения Российской империи 1897 года"

          # =====================================================================
          # ДВОРЯНСТВО
          # =====================================================================
          - when:
              any:
                - title_include: 'дворян'
                - title_include: 'граф'
                - title_include: 'княз'
                - title_include: 'барон'
                - title_include: 'статский'
                - title_include: 'коллежский'
                - title_include: 'надворный'
                - title_include: 'титулярный'
                - title_include: 'губернский секретарь'
                - title_include: 'регистратор'
                - title_include: 'действительный'
                - title_include: 'тайный советник'
                - title_include: 'камер-юнкер'
                - title_include: 'камергер'
                - occu_include: 'офицер'
                - occu_include: 'поручик'
                - occu_include: 'подпоручик'
                - occu_include: 'капитан'
                - occu_include: 'майор'
                - occu_include: 'полковник'
                - occu_include: 'генерал'
                - occu_include: 'ротмистр'
                - occu_include: 'корнет'
                - occu_include: 'мичман'
                - occu_include: 'чиновник'
                - occu_include: 'помещик'
            rules:
              - when:
                  alive_in_range: [1722, 1917]
                source: "Дела Департамента герольдии Правительствующего Сената"
              - when:
                  alive_in_range: [1785, 1917]
                source: "Дворянские родословные книги"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Жалованные грамоты и патенты на чины"
              - when:
                  alive_in_range: [1797, 1917]
                source: "Общий гербовник дворянских родов Всероссийской империи"
              - when:
                  alive_in_range: [1764, 1917]
                source: "Формулярные списки"
              - when:
                  alive_in_range: [1785, 1917]
                source: "Журналы дворянских депутатских собраний"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Дела дворянских опек"
              - when:
                  all:
                    - sex: M
                    - alive_in_range: [1875, 1917]
                source: "Призывные списки"

          # =====================================================================
          # ДУХОВЕНСТВО
          # =====================================================================
          - when:
              any:
                - title_include: 'священник'
                - title_include: 'иерей'
                - title_include: 'протоиерей'
                - title_include: 'диакон'
                - title_include: 'дьякон'
                - title_include: 'архиерей'
                - title_include: 'епископ'
                - title_include: 'архиепископ'
                - title_include: 'митрополит'
                - title_include: 'игумен'
                - title_include: 'архимандрит'
                - occu_include: 'священник'
                - occu_include: 'иерей'
                - occu_include: 'диакон'
                - occu_include: 'дьякон'
                - occu_include: 'дьячок'
                - occu_include: 'пономарь'
                - occu_include: 'псаломщик'
                - occu_include: 'причетник'
                - occu_include: 'просфорня'
                - occu_include: 'монах'
                - occu_include: 'монахиня'
                - occu_include: 'инок'
                - occu_include: 'послушник'
            rules:
              - when:
                  alive_in_range: [1769, 1917]
                source: "Клировые ведомости"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Ставленнические дела"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Формулярные списки священно- и церковнослужителей"
              - when:
                  alive_in_range: [1860, 1917]
                source: "Епархиальные ведомости"
              - when:
                  alive_in_range: [1721, 1917]
                source: "Дела духовных консисторий и духовных правлений"
              - when:
                  alive_in_range: [1721, 1917]
                source: "Списки воспитанников духовных учебных заведений"
              - when:
                  all:
                    - sex: M
                    - alive_in_range: [1875, 1917]
                source: "Призывные списки"

          # =====================================================================
          # КУПЕЧЕСТВО
          # =====================================================================
          - when:
              any:
                - occu_include: 'купец'
                - occu_include: 'купчиха'
                - occu_include: 'гильдии'
                - occu_include: 'гильдия'
                - title_include: 'купец'
                - title_include: 'почетный гражданин'
                - title_include: 'почётный гражданин'
            rules:
              - when:
                  alive_in_range: [1775, 1917]
                source: "Объявления купеческих капиталов"
              - when:
                  alive_in_range: [1775, 1917]
                source: "Гильдейские списки"
              - when:
                  alive_in_range: [1785, 1917]
                source: "Городские обывательские книги"
              - when:
                  alive_in_range: [1832, 1917]
                source: "Списки потомственных и личных почётных граждан"
              - when:
                  alive_in_range: [1775, 1917]
                source: "Дела городских магистратов, ратуш и купеческих управ"
              - when:
                  alive_in_range: [1857, 1859]
                source: "Ревизские сказки десятой ревизии"
              - when:
                  alive_in: 1850
                source: "Ревизские сказки девятой ревизии"
              - when:
                  alive_in_range: [1833, 1835]
                source: "Ревизские сказки восьмой ревизии"
              - when:
                  alive_in_range: [1816, 1825]
                source: "Ревизские сказки седьмой ревизии"
              - when:
                  alive_in_range: [1811, 1812]
                source: "Ревизские сказки шестой ревизии"
              - when:
                  alive_in_range: [1795, 1808]
                source: "Ревизские сказки пятой ревизии"
              - when:
                  alive_in_range: [1782, 1787]
                source: "Ревизские сказки четвертой ревизии"
              - when:
                  alive_in_range: [1761, 1767]
                source: "Ревизские сказки третьей ревизии"
              - when:
                  alive_in_range: [1744, 1747]
                source: "Ревизские сказки второй ревизии"
              - when:
                  alive_in_range: [1719, 1727]
                source: "Ревизские сказки первой ревизии"
              - when:
                  sex: M
                rules:
                  - when:
                      alive_in_range: [1700, 1874]
                    source: "Рекрутские списки и рекрутские квитанции"
                  - when:
                      alive_in_range: [1875, 1917]
                    source: "Призывные списки"

          # =====================================================================
          # МЕЩАНСТВО
          # =====================================================================
          - when:
              any:
                - occu_include: 'мещан'
                - occu_include: 'ремесленник'
                - occu_include: 'цеховой'
                - occu_include: 'цеховая'
                - occu_include: 'портной'
                - occu_include: 'сапожник'
                - occu_include: 'кузнец'
                - occu_include: 'столяр'
                - occu_include: 'плотник'
                - occu_include: 'каменщик'
                - title_include: 'мещан'
            rules:
              - when:
                  alive_in_range: [1785, 1917]
                source: "Городские обывательские книги"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Цеховые книги и росписи"
              - when:
                  alive_in_range: [1775, 1917]
                source: "Дела городских магистратов, ратуш, мещанских управ и городских дум"
              - when:
                  alive_in_range: [1874, 1917]
                source: "Посемейные списки"
              - when:
                  alive_in_range: [1832, 1917]
                source: "Списки личных почётных граждан"
              - when:
                  alive_in_range: [1857, 1859]
                source: "Ревизские сказки десятой ревизии"
              - when:
                  alive_in: 1850
                source: "Ревизские сказки девятой ревизии"
              - when:
                  alive_in_range: [1833, 1835]
                source: "Ревизские сказки восьмой ревизии"
              - when:
                  alive_in_range: [1816, 1825]
                source: "Ревизские сказки седьмой ревизии"
              - when:
                  alive_in_range: [1811, 1812]
                source: "Ревизские сказки шестой ревизии"
              - when:
                  alive_in_range: [1795, 1808]
                source: "Ревизские сказки пятой ревизии"
              - when:
                  alive_in_range: [1782, 1787]
                source: "Ревизские сказки четвертой ревизии"
              - when:
                  alive_in_range: [1761, 1767]
                source: "Ревизские сказки третьей ревизии"
              - when:
                  alive_in_range: [1744, 1747]
                source: "Ревизские сказки второй ревизии"
              - when:
                  alive_in_range: [1719, 1727]
                source: "Ревизские сказки первой ревизии"
              - when:
                  sex: M
                rules:
                  - when:
                      alive_in_range: [1700, 1874]
                    source: "Рекрутские списки"
                  - when:
                      alive_in_range: [1875, 1917]
                    source: "Призывные списки"

          # =====================================================================
          # КАЗАЧЕСТВО
          # =====================================================================
          - when:
              any:
                - occu_include: 'казак'
                - occu_include: 'казачка'
                - occu_include: 'атаман'
                - occu_include: 'есаул'
                - occu_include: 'хорунжий'
                - occu_include: 'сотник'
                - occu_include: 'урядник'
                - title_include: 'казак'
                - title_include: 'атаман'
            rules:
              - when:
                  alive_in_range: [1722, 1917]
                source: "Дела войсковых и станичных правлений"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Посемейные списки казаков"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Формулярные списки казачьих чинов"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Дела войсковых правлений и канцелярий наказных атаманов"
              - when:
                  alive_in_range: [1722, 1917]
                source: "Списки и ведомости служилых казаков"

          # =====================================================================
          # КРЕСТЬЯНСТВО (default)
          # =====================================================================
          - when:
              any:
                - occu_include: 'крестьян'
                - occu_include: 'землепашец'
                - occu_include: 'пахарь'
                - occu_include: 'батрак'
                - title_include: 'крестьян'
                - all:
                    - has_occu: false
                    - has_title: false
            rules:
              - when:
                  alive_in_range: [1715, 1717]
                source: "Материалы ландратской переписи"
              - when:
                  alive_in_range: [1861, 1880]
                source: "Уставные грамоты"
              - when:
                  alive_in_range: [1862, 1907]
                source: "Выкупные дела"
              - when:
                  alive_in_range: [1838, 1866]
                source: "Дела учреждений Министерства государственных имуществ"
              - when:
                  alive_in_range: [1797, 1917]
                source: "Дела учреждений Удельного ведомства"
              - when:
                  alive_in_range: [1797, 1917]
                source: "Дела волостных правлений и сельских обществ"
              - when:
                  alive_in_range: [1797, 1917]
                source: "Дела о переселении крестьян"
              - when:
                  alive_in_range: [1861, 1917]
                source: "Судебные дела волостных судов"
              - when:
                  alive_in_range: [1874, 1917]
                source: "Посемейные списки"
              - when:
                  alive_in_range: [1880, 1917]
                source: "Материалы земских подворных переписей"
              - when:
                  alive_in_range: [1883, 1917]
                source: "Дела Крестьянского поземельного банка"
              - when:
                  alive_in_range: [1916, 1917]
                source: "Материалы Всероссийской сельскохозяйственной переписи 1916–1917 годов"
              - when:
                  alive_in_range: [1857, 1859]
                source: "Ревизские сказки десятой ревизии"
              - when:
                  alive_in: 1850
                source: "Ревизские сказки девятой ревизии"
              - when:
                  alive_in_range: [1833, 1835]
                source: "Ревизские сказки восьмой ревизии"
              - when:
                  alive_in_range: [1816, 1825]
                source: "Ревизские сказки седьмой ревизии"
              - when:
                  alive_in_range: [1811, 1812]
                source: "Ревизские сказки шестой ревизии"
              - when:
                  alive_in_range: [1795, 1808]
                source: "Ревизские сказки пятой ревизии"
              - when:
                  alive_in_range: [1782, 1787]
                source: "Ревизские сказки четвертой ревизии"
              - when:
                  alive_in_range: [1761, 1767]
                source: "Ревизские сказки третьей ревизии"
              - when:
                  alive_in_range: [1744, 1747]
                source: "Ревизские сказки второй ревизии"
              - when:
                  alive_in_range: [1719, 1727]
                source: "Ревизские сказки первой ревизии"
              - when:
                  sex: M
                rules:
                  - when:
                      alive_in_range: [1700, 1874]
                    source: "Рекрутские списки"
                  - when:
                      alive_in_range: [1875, 1917]
                    source: "Призывные списки"
`;
