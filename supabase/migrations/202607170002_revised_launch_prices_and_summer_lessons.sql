with revised_prices(program_slug, level_name, price_kobo) as (
  values
    ('graphic-design', 'Design Foundations', 1000000),
    ('graphic-design', 'Brand and Social Media Design', 2000000),
    ('graphic-design', 'Visual Identity and Professional Portfolio', 3500000),
    ('web-design-and-development', 'Web Foundations', 2000000),
    ('web-design-and-development', 'Frontend Development', 3500000),
    ('web-design-and-development', 'Full-Stack Web Applications', 5500000),
    ('software-development', 'Programming Foundations', 2500000),
    ('software-development', 'Application Development', 4500000),
    ('software-development', 'Software Engineering Practice', 7000000),
    ('video-editing', 'Video Editing Essentials', 1500000),
    ('video-editing', 'Professional Editing and Storytelling', 2500000),
    ('video-editing', 'Motion Graphics and Commercial Production', 4000000),
    ('python-programming', 'Python Foundations', 1800000),
    ('python-programming', 'Automation, Data and APIs', 3200000),
    ('python-programming', 'Python Application Development', 5000000),
    ('digital-marketing', 'Digital Marketing Foundations', 1800000),
    ('digital-marketing', 'Campaigns, Content and Advertising', 3500000),
    ('digital-marketing', 'Analytics and Growth Strategy', 5500000),
    ('affiliate-marketing', 'Affiliate Marketing Starter', 1200000),
    ('affiliate-marketing', 'Campaign and Funnel Building', 2200000),
    ('affiliate-marketing', 'Optimization and Ethical Scaling', 3500000),
    ('business-management', 'Business Essentials', 1500000),
    ('business-management', 'Operations, Finance and Customer Management', 2500000),
    ('business-management', 'Strategy, Leadership and Business Growth', 4000000),
    ('data-analysis', 'Excel Data Essentials', 2000000),
    ('data-analysis', 'SQL and Power BI Analysis', 4000000),
    ('data-analysis', 'Python Analytics and Portfolio Projects', 6500000),
    ('ui-ux-design', 'UX and Interface Foundations', 2000000),
    ('ui-ux-design', 'Product Design and Interactive Prototyping', 3500000),
    ('ui-ux-design', 'Design Systems and Professional Portfolio', 5500000),
    ('mobile-app-development', 'Mobile Development Foundations', 2500000),
    ('mobile-app-development', 'Cross-Platform Application Development', 4500000),
    ('mobile-app-development', 'Production Apps, APIs and Deployment', 7000000),
    ('cybersecurity-basics', 'Cybersecurity Foundations', 2000000),
    ('cybersecurity-basics', 'Network and Endpoint Security', 4000000),
    ('cybersecurity-basics', 'Junior Security Analyst Track', 6500000),
    ('virtual-assistance', 'Virtual Assistant Essentials', 1200000),
    ('virtual-assistance', 'Executive and Digital Operations', 2200000),
    ('virtual-assistance', 'Specialized Technical Virtual Assistance', 3500000),
    ('content-creation', 'Content Creation Foundations', 1200000),
    ('content-creation', 'Video and Social Content Production', 2200000),
    ('content-creation', 'Content Strategy and Brand Growth', 3500000),
    ('cv-professional-portfolio-development', 'Career Starter Package', 1000000),
    ('cv-professional-portfolio-development', 'Professional Branding Package', 1500000),
    ('cv-professional-portfolio-development', 'Technology Portfolio Package', 2500000)
)
update public.program_levels
set price_kobo = revised_prices.price_kobo
from revised_prices
join public.programs on programs.slug = revised_prices.program_slug
where program_levels.program_id = programs.id
  and program_levels.level_name = revised_prices.level_name;
